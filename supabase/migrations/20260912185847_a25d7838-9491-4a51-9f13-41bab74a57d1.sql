CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id uuid REFERENCES public.purchase_order_items(id),
  product_id uuid REFERENCES public.products(id),
  description text,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_items TO authenticated;
GRANT ALL ON public.goods_receipt_items TO service_role;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage goods receipt items" ON public.goods_receipt_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_gri_receipt ON public.goods_receipt_items(goods_receipt_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_code ON public.suppliers(company_id, lower(code)) WHERE code IS NOT NULL AND code <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_trn ON public.suppliers(company_id, trn) WHERE trn IS NOT NULL AND trn <> '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_email ON public.suppliers(company_id, lower(email)) WHERE email IS NOT NULL AND email <> '';

CREATE OR REPLACE FUNCTION public.guard_posted_ledger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  raise exception 'Posted ledger records are immutable. Use a reversal or correction entry instead.';
end $$;

DROP TRIGGER IF EXISTS trg_je_immutable ON public.journal_entries;
CREATE TRIGGER trg_je_immutable BEFORE UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_ledger();
DROP TRIGGER IF EXISTS trg_jel_immutable ON public.journal_entry_lines;
CREATE TRIGGER trg_jel_immutable BEFORE UPDATE OR DELETE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_ledger();

CREATE OR REPLACE FUNCTION public.guard_posted_document()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
begin
  if OLD.status::text in ('posted','partially_paid','paid','overdue') then
    raise exception 'This document is posted and cannot be deleted. Void it instead to create a reversing entry.';
  end if;
  return OLD;
end $$;

DROP TRIGGER IF EXISTS trg_invoice_nodelete ON public.invoices;
CREATE TRIGGER trg_invoice_nodelete BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_document();
DROP TRIGGER IF EXISTS trg_bill_nodelete ON public.supplier_bills;
CREATE TRIGGER trg_bill_nodelete BEFORE DELETE ON public.supplier_bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_document();
DROP TRIGGER IF EXISTS trg_expense_nodelete ON public.expenses;
CREATE TRIGGER trg_expense_nodelete BEFORE DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.guard_posted_document();

CREATE OR REPLACE FUNCTION public.receive_goods(p_po uuid, p_lines jsonb, p_date date DEFAULT current_date, p_actor text DEFAULT 'Ahmed Rahman')
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare po purchase_orders%rowtype; it jsonb; li purchase_order_items%rowtype;
        v_gr uuid; v_qty numeric; v_prev numeric; v_value numeric:=0; v_open numeric:=0; sup text;
begin
  select * into po from purchase_orders where id=p_po;
  if po.id is null then raise exception 'Purchase order not found'; end if;
  if po.status = 'cancelled' then raise exception 'Cancelled purchase orders cannot be received'; end if;
  if jsonb_array_length(coalesce(p_lines,'[]'::jsonb)) = 0 then raise exception 'Select at least one line to receive'; end if;
  select name into sup from suppliers where id=po.supplier_id;

  insert into goods_receipts(company_id,number,purchase_order_id,supplier_id,receipt_date,total_value,status)
  values (po.company_id,next_doc_number(po.company_id,'goods_receipt'),p_po,po.supplier_id,p_date,0,'received')
  returning id into v_gr;

  for it in select * from jsonb_array_elements(p_lines) loop
    select * into li from purchase_order_items where id=(it->>'purchase_order_item_id')::uuid and purchase_order_id=p_po;
    if li.id is null then raise exception 'Line does not belong to this purchase order'; end if;
    v_qty := coalesce((it->>'quantity')::numeric,0);
    if v_qty <= 0 then continue; end if;
    select coalesce(sum(gi.quantity),0) into v_prev from goods_receipt_items gi
      join goods_receipts g on g.id=gi.goods_receipt_id
      where gi.purchase_order_item_id=li.id and g.id <> v_gr and g.status <> 'cancelled';
    if v_prev + v_qty > li.quantity + 0.0001 then
      raise exception 'Cannot receive % of "%": only % remaining of % ordered', v_qty, li.description, li.quantity - v_prev, li.quantity;
    end if;
    insert into goods_receipt_items(goods_receipt_id,purchase_order_item_id,product_id,description,quantity,unit_cost,value)
    values (v_gr,li.id,li.product_id,li.description,v_qty,li.unit_price,round(v_qty*li.unit_price,2));
    v_value := v_value + round(v_qty*li.unit_price,2);
    if li.product_id is not null then
      perform move_inventory(po.company_id,li.product_id,v_qty,li.unit_price,'goods_receipt','goods_receipt',v_gr,p_date);
    end if;
  end loop;

  if v_value = 0 then raise exception 'Nothing was received — enter a quantity on at least one line'; end if;

  perform post_journal(po.company_id, p_date, 'Goods received '||(select number from goods_receipts where id=v_gr)||' — '||sup,
    'goods_receipt', v_gr, (select number from goods_receipts where id=v_gr),
    jsonb_build_array(
      jsonb_build_object('code','1210','desc','Goods received into stock','debit',v_value,'credit',0),
      jsonb_build_object('code','2200','desc','Goods received not invoiced','debit',0,'credit',v_value)),
    'goods_receipt');

  update goods_receipts set total_value=v_value where id=v_gr;

  select coalesce(sum(poi.quantity),0) - coalesce((
    select sum(gi.quantity) from goods_receipt_items gi join goods_receipts g on g.id=gi.goods_receipt_id
    where g.purchase_order_id=p_po and g.status <> 'cancelled'),0)
  into v_open from purchase_order_items poi where poi.purchase_order_id=p_po;

  update purchase_orders set status = case when v_open <= 0.0001 then 'posted'::doc_status else 'confirmed'::doc_status end where id=p_po;
  update goods_receipts set status = case when v_open <= 0.0001 then 'received' else 'partial' end where id=v_gr;

  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (po.company_id,'goods_received','Goods received against '||po.number, sup||' — '||
    case when v_open <= 0.0001 then 'order complete' else 'partial receipt, '||v_open||' units still open' end,
    v_value,p_actor,'goods_receipt',v_gr);

  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (po.company_id,p_actor,'Goods received','goods_receipt',v_gr,(select number from goods_receipts where id=v_gr),
    jsonb_build_object('value',v_value,'purchase_order',po.number,'open_quantity',v_open),'purchasing');

  return v_gr;
end $$;

CREATE OR REPLACE FUNCTION public.create_supplier_bill(p_company uuid, p_supplier uuid, p_bill_date date, p_due_date date, p_items jsonb, p_supplier_ref text DEFAULT NULL::text, p_purchase_order uuid DEFAULT NULL::uuid, p_goods_receipt uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare v_id uuid; it jsonb; v_sub numeric:=0; v_vat numeric:=0; v_line numeric; v_qty numeric; v_price numeric; v_rate numeric; v_prod uuid; v_due date;
        po purchase_orders%rowtype; v_diff numeric; v_tol_abs numeric; v_tol_pct numeric; v_match text:='matched'; v_gr uuid; sup text; v_detail text;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Bill needs at least one line'; end if;
  select name into sup from suppliers where id=p_supplier;
  v_due := coalesce(p_due_date, p_bill_date + coalesce((select payment_terms_days from suppliers where id=p_supplier),30));
  v_gr := p_goods_receipt;
  insert into supplier_bills(company_id,number,supplier_ref,supplier_id,purchase_order_id,bill_date,due_date,subtotal,vat,total,amount_paid,balance,match_status,status)
  values (p_company,next_doc_number(p_company,'supplier_bill'),p_supplier_ref,p_supplier,p_purchase_order,p_bill_date,v_due,0,0,0,0,0,'pending','posted') returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1); v_price := coalesce((it->>'unit_price')::numeric,0); v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    v_line := round(v_qty*v_price,2);
    insert into supplier_bill_items(supplier_bill_id,product_id,description,quantity,unit_price,vat_rate,line_total)
    values (v_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_rate,v_line);
    v_sub := v_sub + v_line; v_vat := v_vat + round(v_line*v_rate,2);
    -- stock already moved when the goods receipt was booked
    if v_prod is not null and p_goods_receipt is null then
      perform move_inventory(p_company,v_prod,v_qty,v_price,'purchase_receipt','supplier_bill',v_id,p_bill_date);
    end if;
  end loop;

  if p_purchase_order is not null then
    select * into po from purchase_orders where id=p_purchase_order;
    if p_goods_receipt is null then
      insert into goods_receipts(company_id,number,purchase_order_id,supplier_id,receipt_date,total_value,status)
      values (p_company,next_doc_number(p_company,'goods_receipt'),p_purchase_order,p_supplier,p_bill_date,v_sub,'received') returning id into v_gr;
      update purchase_orders set status='posted' where id=p_purchase_order;
    end if;
    v_diff := round(v_sub - coalesce(po.subtotal,0),2);
    select coalesce((value->>'amount')::numeric,100) into v_tol_abs from settings where company_id=p_company and key='three_way_match_tolerance';
    select coalesce((value->>'percent')::numeric,1) into v_tol_pct from settings where company_id=p_company and key='three_way_match_tolerance';
    if abs(v_diff) > greatest(coalesce(v_tol_abs,100), coalesce(po.subtotal,0)*coalesce(v_tol_pct,1)/100) then
      v_match := 'mismatch';
      select string_agg(format('%s: ordered %s @ %s, received %s, billed %s @ %s', m.description, m.ordered_quantity, m.ordered_price, m.received_quantity, m.billed_quantity, m.billed_price), '; ')
        into v_detail from public.po_match_lines(p_purchase_order) m where abs(m.quantity_variance) > 0.0001 or abs(m.price_variance) > 0.0001;
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'three_way_mismatch','Bill differs from PO — '||sup,'high','Accounts payable','supplier_bill',v_id,
        (select number from supplier_bills where id=v_id),abs(v_diff),
        'Bill subtotal AED '||v_sub||' vs PO '||po.number||' AED '||po.subtotal||' (difference AED '||v_diff||'). '||coalesce(v_detail,''),
        'Difference exceeds the three-way match tolerance.',
        case when v_diff > 0 then 'Request a supplier credit note or approve the price increase.' else 'Recognise the saving and approve for payment.' end,
        80,'["supplier_credit","keep_outstanding","investigate","dismiss"]'::jsonb,'open',p_bill_date+5);
    end if;
  end if;

  update supplier_bills set subtotal=v_sub, vat=v_vat, total=round(v_sub+v_vat,2), balance=round(v_sub+v_vat,2), match_status=v_match, goods_receipt_id=v_gr where id=v_id;
  perform post_supplier_bill(v_id);
  return v_id;
end $$;

CREATE OR REPLACE FUNCTION public.post_supplier_bill(p_bill uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
declare b public.supplier_bills%rowtype; sup text; je uuid; v_accrued numeric:=0; v_stock numeric;
begin
  select * into b from public.supplier_bills where id = p_bill;
  select name into sup from public.suppliers where id = b.supplier_id;
  if b.goods_receipt_id is not null then
    select least(coalesce(total_value,0), b.subtotal) into v_accrued from public.goods_receipts where id=b.goods_receipt_id;
  end if;
  v_accrued := coalesce(v_accrued,0);
  v_stock := round(b.subtotal - v_accrued, 2);

  je := public.post_journal(b.company_id, b.bill_date, 'Supplier bill '||b.number||' — '||sup,
    'supplier_bill', b.id, b.number,
    (case when v_accrued > 0 then jsonb_build_array(jsonb_build_object('code','2200','desc','Goods received not invoiced cleared','debit', v_accrued,'credit',0)) else '[]'::jsonb end)
    || (case when v_stock <> 0 then jsonb_build_array(jsonb_build_object('code','1210','desc','Raw material received','debit', v_stock,'credit',0)) else '[]'::jsonb end)
    || jsonb_build_array(
      jsonb_build_object('code','1400','desc','VAT input 5%','debit', b.vat,'credit',0),
      jsonb_build_object('code','2000','desc', sup,'debit',0,'credit', b.total)));

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (b.company_id, 'bill_approved', 'Supplier bill '||b.number||' posted', sup||' — '||b.match_status, b.total, 'System', 'supplier_bill', b.id);

  insert into public.audit_logs (company_id, actor, action, entity_type, entity_id, entity_label, after, source)
  values (b.company_id,'System','Supplier bill posted','supplier_bill',b.id,b.number,
    jsonb_build_object('total',b.total,'vat',b.vat,'match_status',b.match_status,'journal_entry',je),'payables');
  return je;
end $$;

CREATE OR REPLACE FUNCTION public.po_match_lines(p_po uuid)
RETURNS TABLE(purchase_order_item_id uuid, product_id uuid, description text,
  ordered_quantity numeric, ordered_price numeric, ordered_vat numeric,
  received_quantity numeric, billed_quantity numeric, billed_price numeric, billed_vat numeric,
  quantity_variance numeric, price_variance numeric, vat_variance numeric, value_variance numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select poi.id, poi.product_id, poi.description,
    poi.quantity, poi.unit_price, round(poi.quantity*poi.unit_price*poi.vat_rate,2),
    coalesce(gr.qty,0),
    coalesce(bi.qty,0), coalesce(bi.price, poi.unit_price), coalesce(bi.vat,0),
    coalesce(bi.qty,0) - poi.quantity,
    coalesce(bi.price, poi.unit_price) - poi.unit_price,
    coalesce(bi.vat,0) - round(poi.quantity*poi.unit_price*poi.vat_rate,2),
    coalesce(bi.value,0) - round(poi.quantity*poi.unit_price,2)
  from purchase_order_items poi
  left join lateral (
    select sum(gi.quantity) as qty from goods_receipt_items gi
    join goods_receipts g on g.id=gi.goods_receipt_id
    where gi.purchase_order_item_id=poi.id and g.status <> 'cancelled') gr on true
  left join lateral (
    select sum(sbi.quantity) as qty, max(sbi.unit_price) as price,
           sum(round(sbi.line_total*sbi.vat_rate,2)) as vat, sum(sbi.line_total) as value
    from supplier_bill_items sbi join supplier_bills sb on sb.id=sbi.supplier_bill_id
    where sb.purchase_order_id=p_po and sb.status <> 'cancelled'
      and (sbi.product_id = poi.product_id or (sbi.product_id is null and sbi.description = poi.description))) bi on true
  where poi.purchase_order_id=p_po
  order by poi.description;
$$;

CREATE OR REPLACE FUNCTION public.po_open_lines(p_po uuid)
RETURNS TABLE(purchase_order_item_id uuid, product_id uuid, description text, ordered_quantity numeric,
  unit_price numeric, vat_rate numeric, received_quantity numeric, open_quantity numeric)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select poi.id, poi.product_id, poi.description, poi.quantity, poi.unit_price, poi.vat_rate,
    coalesce(gr.qty,0), poi.quantity - coalesce(gr.qty,0)
  from purchase_order_items poi
  left join lateral (
    select sum(gi.quantity) as qty from goods_receipt_items gi
    join goods_receipts g on g.id=gi.goods_receipt_id
    where gi.purchase_order_item_id=poi.id and g.status <> 'cancelled') gr on true
  where poi.purchase_order_id=p_po
  order by poi.description;
$$;

CREATE OR REPLACE FUNCTION public.automation_selftest()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_company uuid; k text; out jsonb := '{}'::jsonb;
begin
  select id into v_company from companies order by created_at limit 1;
  if v_company is null then return jsonb_build_object('ok',false,'error','no company'); end if;
  foreach k in array array['invoice','sales_order','customer_payment','purchase_order','goods_receipt','supplier_bill','supplier_payment','expense','exception'] loop
    out := out || jsonb_build_object(k, next_doc_number(v_company, k));
  end loop;
  return jsonb_build_object('ok', true, 'company', v_company, 'numbers', out);
end $$;
GRANT EXECUTE ON FUNCTION public.automation_selftest() TO anon, authenticated, service_role;