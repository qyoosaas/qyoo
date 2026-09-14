CREATE TABLE IF NOT EXISTS public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  number text NOT NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id),
  customer_id uuid REFERENCES public.customers(id),
  delivery_date date NOT NULL DEFAULT current_date,
  total_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'delivered',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_notes TO authenticated;
GRANT ALL ON public.delivery_notes TO service_role;
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can manage delivery notes" ON public.delivery_notes;
CREATE POLICY "Authenticated can manage delivery notes" ON public.delivery_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  sales_order_item_id uuid REFERENCES public.sales_order_items(id),
  product_id uuid REFERENCES public.products(id),
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_note_items TO authenticated;
GRANT ALL ON public.delivery_note_items TO service_role;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated can manage delivery note items" ON public.delivery_note_items;
CREATE POLICY "Authenticated can manage delivery note items" ON public.delivery_note_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_dni_note ON public.delivery_note_items(delivery_note_id);
CREATE INDEX IF NOT EXISTS idx_dn_so ON public.delivery_notes(sales_order_id);

INSERT INTO public.accounts (company_id, code, name, type, subtype, parent_code, is_group)
SELECT c.id, '1240', 'Goods Delivered Not Invoiced', 'asset'::account_type, 'current_asset', NULL, false
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.company_id = c.id AND a.code = '1240');

CREATE OR REPLACE FUNCTION public.next_doc_number(p_company uuid, p_kind text)
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_max int; v_prefix text;
begin
  case p_kind
    when 'invoice' then select coalesce(max(substring(number from '\d+$')::int),10000) into v_max from invoices where company_id=p_company; v_prefix:='INV-';
    when 'sales_order' then select coalesce(max(substring(number from '\d+$')::int),20000) into v_max from sales_orders where company_id=p_company; v_prefix:='SO-';
    when 'customer_payment' then select coalesce(max(substring(number from '\d+$')::int),30000) into v_max from customer_payments where company_id=p_company; v_prefix:='RCP-';
    when 'delivery_note' then select coalesce(max(substring(number from '\d+$')::int),40000) into v_max from delivery_notes where company_id=p_company; v_prefix:='DN-';
    when 'purchase_order' then select coalesce(max(substring(number from '\d+$')::int),50000) into v_max from purchase_orders where company_id=p_company; v_prefix:='PO-';
    when 'goods_receipt' then select coalesce(max(substring(number from '\d+$')::int),60000) into v_max from goods_receipts where company_id=p_company; v_prefix:='GRN-';
    when 'supplier_bill' then select coalesce(max(substring(number from '\d+$')::int),70000) into v_max from supplier_bills where company_id=p_company; v_prefix:='BILL-';
    when 'supplier_payment' then select coalesce(max(substring(number from '\d+$')::int),80000) into v_max from supplier_payments where company_id=p_company; v_prefix:='PMT-';
    when 'expense' then select coalesce(max(substring(number from '\d+$')::int),90000) into v_max from expenses where company_id=p_company; v_prefix:='EXP-';
    when 'exception' then select coalesce(max(substring(code from '\d+$')::int),1000) into v_max from exceptions where company_id=p_company; v_prefix:='EXC-';
    else raise exception 'Unknown doc kind %', p_kind;
  end case;
  return v_prefix || (v_max + 1)::text;
end $function$;

CREATE OR REPLACE FUNCTION public.create_sales_order(p_company uuid, p_customer uuid, p_order_date date, p_expected date, p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare v_id uuid; it jsonb; v_sub numeric:=0; v_disc numeric:=0; v_vat numeric:=0; v_line numeric;
        v_qty numeric; v_price numeric; v_ldisc numeric; v_rate numeric; v_prod uuid; cust text;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Order needs at least one line'; end if;
  select name into cust from customers where id=p_customer;
  if cust is null then raise exception 'Choose a customer'; end if;
  insert into sales_orders(company_id,number,customer_id,order_date,expected_delivery,subtotal,discount,vat,total,status)
  values (p_company,next_doc_number(p_company,'sales_order'),p_customer,p_order_date,p_expected,0,0,0,0,'confirmed')
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1);
    v_price := coalesce((it->>'unit_price')::numeric,0);
    v_ldisc := coalesce((it->>'discount')::numeric,0);
    v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    if v_qty <= 0 then continue; end if;
    v_line := round(v_qty*v_price - v_ldisc,2);
    insert into sales_order_items(sales_order_id,product_id,description,quantity,unit_price,discount,vat_rate,line_total)
    values (v_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_ldisc,v_rate,v_line);
    v_sub := v_sub + round(v_qty*v_price,2); v_disc := v_disc + v_ldisc; v_vat := v_vat + round(v_line*v_rate,2);
  end loop;

  update sales_orders set subtotal=v_sub, discount=v_disc, vat=v_vat, total=round(v_sub-v_disc+v_vat,2) where id=v_id;

  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (p_company,'sales_order_created','Sales order '||(select number from sales_orders where id=v_id)||' confirmed for '||cust,
          'Awaiting delivery — no ledger impact until goods leave the warehouse',round(v_sub-v_disc+v_vat,2),'System','sales_order',v_id);
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (p_company,'System','Sales order created','sales_order',v_id,(select number from sales_orders where id=v_id),
          jsonb_build_object('total',round(v_sub-v_disc+v_vat,2),'customer',cust),'sales');
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.so_open_lines(p_so uuid)
RETURNS TABLE(sales_order_item_id uuid, product_id uuid, description text, ordered_quantity numeric,
              unit_price numeric, discount numeric, vat_rate numeric, delivered_quantity numeric, open_quantity numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select soi.id, soi.product_id, soi.description, soi.quantity, soi.unit_price, soi.discount, soi.vat_rate,
         coalesce(d.qty,0),
         greatest(soi.quantity - coalesce(d.qty,0), 0)
  from sales_order_items soi
  left join (
    select dni.sales_order_item_id, sum(dni.quantity) qty
    from delivery_note_items dni join delivery_notes dn on dn.id=dni.delivery_note_id
    where dn.status <> 'cancelled'
    group by dni.sales_order_item_id
  ) d on d.sales_order_item_id = soi.id
  where soi.sales_order_id = p_so
  order by soi.description;
$$;

CREATE OR REPLACE FUNCTION public.so_match_lines(p_so uuid)
RETURNS TABLE(sales_order_item_id uuid, product_id uuid, description text, ordered_quantity numeric,
              ordered_price numeric, delivered_quantity numeric, invoiced_quantity numeric, invoiced_price numeric,
              quantity_variance numeric, price_variance numeric, value_variance numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select soi.id, soi.product_id, soi.description, soi.quantity, soi.unit_price,
         coalesce(d.qty,0), coalesce(i.qty,0), coalesce(i.price, soi.unit_price),
         coalesce(i.qty,0) - coalesce(d.qty,0),
         coalesce(i.price, soi.unit_price) - soi.unit_price,
         round(coalesce(i.qty,0)*coalesce(i.price,soi.unit_price) - coalesce(d.qty,0)*soi.unit_price, 2)
  from sales_order_items soi
  left join (
    select dni.sales_order_item_id, sum(dni.quantity) qty
    from delivery_note_items dni join delivery_notes dn on dn.id=dni.delivery_note_id
    where dn.status <> 'cancelled' group by dni.sales_order_item_id
  ) d on d.sales_order_item_id = soi.id
  left join (
    select ii.product_id, ii.description, sum(ii.quantity) qty,
           case when sum(ii.quantity) > 0 then round(sum(ii.quantity*ii.unit_price)/sum(ii.quantity),4) else 0 end price
    from invoice_items ii join invoices inv on inv.id=ii.invoice_id
    where inv.sales_order_id = p_so and inv.status <> 'cancelled'
    group by ii.product_id, ii.description
  ) i on (i.product_id is not distinct from soi.product_id and (soi.product_id is not null or i.description = soi.description))
  where soi.sales_order_id = p_so
  order by soi.description;
$$;

CREATE OR REPLACE FUNCTION public.deliver_goods(p_so uuid, p_lines jsonb, p_date date DEFAULT current_date, p_actor text DEFAULT 'Ahmed Rahman')
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare so sales_orders%rowtype; it jsonb; li sales_order_items%rowtype; v_dn uuid; v_qty numeric; v_prev numeric;
        v_cost numeric; v_value numeric:=0; v_open numeric:=0; cust text; v_num text;
begin
  select * into so from sales_orders where id=p_so;
  if so.id is null then raise exception 'Sales order not found'; end if;
  if so.status = 'cancelled' then raise exception 'Cancelled sales orders cannot be delivered'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Select at least one line to deliver'; end if;
  select name into cust from customers where id=so.customer_id;
  v_num := next_doc_number(so.company_id,'delivery_note');

  insert into delivery_notes(company_id,number,sales_order_id,customer_id,delivery_date,total_value,status)
  values (so.company_id,v_num,p_so,so.customer_id,p_date,0,'delivered') returning id into v_dn;

  for it in select * from jsonb_array_elements(p_lines) loop
    select * into li from sales_order_items where id=(it->>'sales_order_item_id')::uuid and sales_order_id=p_so;
    if li.id is null then raise exception 'Line does not belong to this sales order'; end if;
    v_qty := coalesce((it->>'quantity')::numeric,0);
    if v_qty <= 0 then continue; end if;
    select coalesce(sum(dni.quantity),0) into v_prev from delivery_note_items dni
      join delivery_notes dn on dn.id=dni.delivery_note_id
      where dni.sales_order_item_id=li.id and dn.id <> v_dn and dn.status <> 'cancelled';
    if v_prev + v_qty > li.quantity + 0.0001 then
      raise exception 'Cannot deliver % of "%": only % remaining of % ordered', v_qty, li.description, li.quantity - v_prev, li.quantity;
    end if;
    if li.product_id is not null then
      select coalesce((select avg_cost from inventory_balances where product_id=li.product_id and company_id=so.company_id limit 1), cost)
        into v_cost from products where id=li.product_id;
      perform move_inventory(so.company_id,li.product_id,-v_qty,v_cost,'sales_delivery','delivery_note',v_dn,p_date);
    else
      v_cost := 0;
    end if;
    insert into delivery_note_items(delivery_note_id,sales_order_item_id,product_id,description,quantity,unit_cost,value)
    values (v_dn,li.id,li.product_id,li.description,v_qty,coalesce(v_cost,0),round(v_qty*coalesce(v_cost,0),2));
    v_value := v_value + round(v_qty*coalesce(v_cost,0),2);
  end loop;

  if not exists (select 1 from delivery_note_items where delivery_note_id=v_dn) then
    raise exception 'Nothing was delivered — enter a quantity on at least one line';
  end if;

  if v_value > 0 then
    perform post_journal(so.company_id, p_date, 'Goods delivered '||v_num||' — '||cust,
      'delivery_note', v_dn, v_num,
      jsonb_build_array(
        jsonb_build_object('code','1240','desc','Goods delivered not invoiced','debit',v_value,'credit',0),
        jsonb_build_object('code','1230','desc','Finished goods released','debit',0,'credit',v_value)),
      'delivery');
  end if;

  update delivery_notes set total_value=v_value where id=v_dn;

  select coalesce(sum(soi.quantity),0) - coalesce((
    select sum(dni.quantity) from delivery_note_items dni join delivery_notes dn on dn.id=dni.delivery_note_id
    where dn.sales_order_id=p_so and dn.status <> 'cancelled'),0)
  into v_open from sales_order_items soi where soi.sales_order_id=p_so;

  update sales_orders set status = case when v_open <= 0.0001 then 'posted'::doc_status else 'confirmed'::doc_status end where id=p_so;
  update delivery_notes set status = case when v_open <= 0.0001 then 'delivered' else 'partial' end where id=v_dn;

  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (so.company_id,'goods_delivered','Goods delivered against '||so.number, cust||' — '||
    case when v_open <= 0.0001 then 'order complete' else 'partial delivery, '||v_open||' units still open' end,
    v_value,p_actor,'delivery_note',v_dn);
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (so.company_id,p_actor,'Goods delivered','delivery_note',v_dn,v_num,
    jsonb_build_object('cost_value',v_value,'sales_order',so.number,'open_quantity',v_open),'sales');
  return v_dn;
end $$;

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_so uuid, p_invoice_date date, p_due_date date, p_items jsonb, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare so sales_orders%rowtype; v_id uuid; v_num text; it jsonb; cust text; v_due date;
        v_sub numeric:=0; v_disc numeric:=0; v_vat numeric:=0; v_cogs numeric:=0; v_from_dn numeric:=0;
        v_qty numeric; v_price numeric; v_ldisc numeric; v_rate numeric; v_line numeric; v_prod uuid; v_desc text;
        v_avail numeric; v_cov numeric; v_unc numeric; v_dncost numeric; v_cost numeric; lines jsonb;
begin
  select * into so from sales_orders where id=p_so;
  if so.id is null then raise exception 'Sales order not found'; end if;
  if so.status = 'cancelled' then raise exception 'Cancelled sales orders cannot be invoiced'; end if;
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Invoice needs at least one line'; end if;
  select name into cust from customers where id=so.customer_id;
  v_num := next_doc_number(so.company_id,'invoice');
  v_due := coalesce(p_due_date, p_invoice_date + coalesce((select payment_terms_days from customers where id=so.customer_id),30));

  insert into invoices(company_id,number,customer_id,sales_order_id,invoice_date,due_date,subtotal,discount,vat,total,amount_paid,balance,cogs,status,notes)
  values (so.company_id,v_num,so.customer_id,p_so,p_invoice_date,v_due,0,0,0,0,0,0,0,'draft',p_notes) returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1);
    v_price := coalesce((it->>'unit_price')::numeric,0);
    v_ldisc := coalesce((it->>'discount')::numeric,0);
    v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    if v_qty <= 0 then continue; end if;
    v_line := round(v_qty*v_price - v_ldisc,2);
    v_desc := coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line');
    insert into invoice_items(invoice_id,product_id,description,quantity,unit_price,discount,vat_rate,line_total)
    values (v_id,v_prod,v_desc,v_qty,v_price,v_ldisc,v_rate,v_line);
    v_sub := v_sub + round(v_qty*v_price,2); v_disc := v_disc + v_ldisc; v_vat := v_vat + round(v_line*v_rate,2);

    if v_prod is not null then
      -- quantity already delivered on this order but not yet invoiced
      select coalesce(sum(dni.quantity),0), case when coalesce(sum(dni.quantity),0) > 0
               then round(sum(dni.value)/sum(dni.quantity),4) else 0 end
        into v_avail, v_dncost
      from delivery_note_items dni join delivery_notes dn on dn.id=dni.delivery_note_id
      where dn.sales_order_id=p_so and dn.status <> 'cancelled' and dni.product_id=v_prod;
      v_avail := v_avail - coalesce((
        select sum(ii.quantity) from invoice_items ii join invoices inv on inv.id=ii.invoice_id
        where inv.sales_order_id=p_so and inv.id <> v_id and inv.status <> 'cancelled' and ii.product_id=v_prod),0);
      v_cov := least(greatest(v_avail,0), v_qty);
      v_unc := v_qty - v_cov;
      if v_cov > 0 then
        v_from_dn := v_from_dn + round(v_cov*coalesce(v_dncost,0),2);
        v_cogs := v_cogs + round(v_cov*coalesce(v_dncost,0),2);
      end if;
      if v_unc > 0 then
        select coalesce((select avg_cost from inventory_balances where product_id=v_prod and company_id=so.company_id limit 1), cost)
          into v_cost from products where id=v_prod;
        v_cogs := v_cogs + round(v_unc*coalesce(v_cost,0),2);
        perform move_inventory(so.company_id,v_prod,-v_unc,v_cost,'sales_issue','invoice',v_id,p_invoice_date);
      end if;
    end if;
  end loop;

  update invoices set subtotal=v_sub, discount=v_disc, vat=v_vat, total=round(v_sub-v_disc+v_vat,2),
    balance=round(v_sub-v_disc+v_vat,2), cogs=v_cogs, status='posted' where id=v_id;

  lines := jsonb_build_array(
    jsonb_build_object('code','1100','desc', cust||' — '||v_num,'debit', round(v_sub-v_disc+v_vat,2),'credit',0),
    jsonb_build_object('code','4000','desc','Sales revenue','debit',0,'credit', v_sub),
    jsonb_build_object('code','2100','desc','VAT output 5%','debit',0,'credit', v_vat));
  if v_disc > 0 then
    lines := lines || jsonb_build_array(jsonb_build_object('code','4050','desc','Sales discount','debit',v_disc,'credit',0));
  end if;
  if v_cogs > 0 then
    lines := lines || jsonb_build_array(jsonb_build_object('code','5000','desc','Cost of goods sold','debit',v_cogs,'credit',0));
    if v_from_dn > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object('code','1240','desc','Delivered goods invoiced','debit',0,'credit',v_from_dn));
    end if;
    if v_cogs - v_from_dn > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object('code','1230','desc','Finished goods relieved','debit',0,'credit', round(v_cogs-v_from_dn,2)));
    end if;
  end if;

  perform post_journal(so.company_id, p_invoice_date, 'Sales invoice '||v_num||' — '||cust||' (order '||so.number||')',
    'invoice', v_id, v_num, lines, 'sales');

  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (so.company_id,'System','Invoice posted from sales order','invoice',v_id,v_num,
    jsonb_build_object('total',round(v_sub-v_disc+v_vat,2),'sales_order',so.number,'cogs',v_cogs),'sales');
  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (so.company_id,'invoice_created','Invoice '||v_num||' raised from '||so.number,
    'AR, revenue, VAT and cost of sales posted in one transaction',round(v_sub-v_disc+v_vat,2),'System','invoice',v_id);

  return v_id;
end $$;