CREATE OR REPLACE FUNCTION public.create_supplier_bill(p_company uuid, p_supplier uuid, p_bill_date date, p_due_date date, p_items jsonb, p_supplier_ref text DEFAULT NULL::text, p_purchase_order uuid DEFAULT NULL::uuid, p_goods_receipt uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_id uuid; it jsonb; v_sub numeric:=0; v_vat numeric:=0; v_line numeric; v_qty numeric; v_price numeric; v_rate numeric; v_prod uuid; v_due date;
        po purchase_orders%rowtype; v_diff numeric; v_tol_abs numeric; v_tol_pct numeric; v_match text:='matched'; v_gr uuid; sup text; v_detail text; v_base numeric;
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

    -- a bill raised against a specific receipt is matched to what was received,
    -- so legitimate partial deliveries are not flagged as variances
    if p_goods_receipt is not null then
      select coalesce(total_value,0) into v_base from goods_receipts where id=p_goods_receipt;
    else
      v_base := coalesce(po.subtotal,0);
    end if;

    v_diff := round(v_sub - coalesce(v_base,0),2);
    select coalesce((value->>'amount')::numeric,100) into v_tol_abs from settings where company_id=p_company and key='three_way_match_tolerance';
    select coalesce((value->>'percent')::numeric,1) into v_tol_pct from settings where company_id=p_company and key='three_way_match_tolerance';
    if abs(v_diff) > greatest(coalesce(v_tol_abs,100), coalesce(v_base,0)*coalesce(v_tol_pct,1)/100) then
      v_match := 'mismatch';
      select string_agg(format('%s: ordered %s @ %s, received %s, billed %s @ %s', m.description, m.ordered_quantity, m.ordered_price, m.received_quantity, m.billed_quantity, m.billed_price), '; ')
        into v_detail from public.po_match_lines(p_purchase_order) m where abs(m.price_variance) > 0.0001 or abs(m.quantity_variance) > 0.0001;
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'three_way_mismatch','Bill differs from goods received — '||sup,'high','Accounts payable','supplier_bill',v_id,
        (select number from supplier_bills where id=v_id),abs(v_diff),
        'Bill subtotal AED '||v_sub||' vs expected AED '||v_base||' (difference AED '||v_diff||'). '||coalesce(v_detail,''),
        'Difference exceeds the three-way match tolerance.',
        case when v_diff > 0 then 'Request a supplier credit note or approve the price increase.' else 'Recognise the saving and approve for payment.' end,
        80,'["supplier_credit","keep_outstanding","investigate","dismiss"]'::jsonb,'open',p_bill_date+5);
    end if;
  end if;

  update supplier_bills set subtotal=v_sub, vat=v_vat, total=round(v_sub+v_vat,2), balance=round(v_sub+v_vat,2), match_status=v_match, goods_receipt_id=v_gr where id=v_id;
  perform post_supplier_bill(v_id);
  return v_id;
end $function$;