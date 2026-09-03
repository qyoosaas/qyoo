-- ---------- numbering ----------
create or replace function public.next_doc_number(p_company uuid, p_kind text)
returns text language plpgsql set search_path to 'public' as $$
declare v_max int; v_prefix text;
begin
  case p_kind
    when 'invoice' then select coalesce(max(substring(number from '\d+$')::int),10000) into v_max from invoices where company_id=p_company; v_prefix:='INV-';
    when 'sales_order' then select coalesce(max(substring(number from '\d+$')::int),20000) into v_max from sales_orders where company_id=p_company; v_prefix:='SO-';
    when 'customer_payment' then select coalesce(max(substring(number from '\d+$')::int),30000) into v_max from customer_payments where company_id=p_company; v_prefix:='RCP-';
    when 'purchase_order' then select coalesce(max(substring(number from '\d+$')::int),50000) into v_max from purchase_orders where company_id=p_company; v_prefix:='PO-';
    when 'goods_receipt' then select coalesce(max(substring(number from '\d+$')::int),60000) into v_max from goods_receipts where company_id=p_company; v_prefix:='GRN-';
    when 'supplier_bill' then select coalesce(max(substring(number from '\d+$')::int),70000) into v_max from supplier_bills where company_id=p_company; v_prefix:='BILL-';
    when 'supplier_payment' then select coalesce(max(substring(number from '\d+$')::int),80000) into v_max from supplier_payments where company_id=p_company; v_prefix:='PMT-';
    when 'expense' then select coalesce(max(substring(number from '\d+$')::int),90000) into v_max from expenses where company_id=p_company; v_prefix:='EXP-';
    when 'exception' then select coalesce(max(substring(number from '\d+$')::int),1000) into v_max from exceptions where company_id=p_company; v_prefix:='EXC-';
    else raise exception 'Unknown doc kind %', p_kind;
  end case;
  return v_prefix || (v_max + 1)::text;
end $$;

-- ---------- inventory move ----------
create or replace function public.move_inventory(p_company uuid, p_product uuid, p_qty numeric, p_unit_cost numeric, p_kind text, p_ref_type text, p_ref_id uuid, p_date date)
returns void language plpgsql set search_path to 'public' as $$
declare v_wh uuid; v_bal inventory_balances%rowtype; v_newqty numeric; v_newcost numeric;
begin
  select warehouse_id into v_wh from inventory_balances where company_id=p_company and product_id=p_product limit 1;
  if v_wh is null then select id into v_wh from warehouses where company_id=p_company order by code limit 1; end if;
  select * into v_bal from inventory_balances where company_id=p_company and product_id=p_product and (warehouse_id=v_wh or v_wh is null) limit 1;
  if v_bal.id is null then
    insert into inventory_balances(company_id,product_id,warehouse_id,quantity,avg_cost,value) values (p_company,p_product,v_wh,0,p_unit_cost,0) returning * into v_bal;
  end if;
  v_newqty := v_bal.quantity + p_qty;
  if p_qty > 0 then
    v_newcost := case when v_newqty > 0 then round((v_bal.quantity*v_bal.avg_cost + p_qty*p_unit_cost)/v_newqty,4) else p_unit_cost end;
  else v_newcost := v_bal.avg_cost; end if;
  update inventory_balances set quantity=v_newqty, avg_cost=v_newcost, value=round(v_newqty*v_newcost,2), updated_at=now() where id=v_bal.id;
  insert into inventory_transactions(company_id,product_id,warehouse_id,txn_date,kind,quantity,unit_cost,value,ref_type,ref_id)
  values (p_company,p_product,v_wh,p_date,p_kind,p_qty,coalesce(p_unit_cost,v_bal.avg_cost),round(abs(p_qty)*coalesce(p_unit_cost,v_bal.avg_cost),2),p_ref_type,p_ref_id);
end $$;

-- ---------- create invoice ----------
create or replace function public.create_invoice(p_company uuid, p_customer uuid, p_invoice_date date, p_due_date date, p_items jsonb, p_notes text default null, p_post boolean default true)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; v_num text; it jsonb; v_sub numeric:=0; v_disc numeric:=0; v_vat numeric:=0; v_cogs numeric:=0;
        v_qty numeric; v_price numeric; v_ldisc numeric; v_rate numeric; v_line numeric; v_cost numeric; v_prod uuid; v_desc text; v_due date;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Invoice needs at least one line'; end if;
  v_num := next_doc_number(p_company,'invoice');
  v_due := coalesce(p_due_date, p_invoice_date + coalesce((select payment_terms_days from customers where id=p_customer),30));
  insert into invoices(company_id,number,customer_id,invoice_date,due_date,subtotal,discount,vat,total,amount_paid,balance,cogs,status,notes)
  values (p_company,v_num,p_customer,p_invoice_date,v_due,0,0,0,0,0,0,0,'draft',p_notes) returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1); v_price := coalesce((it->>'unit_price')::numeric,0);
    v_ldisc := coalesce((it->>'discount')::numeric,0); v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    v_line := round(v_qty*v_price - v_ldisc,2);
    v_desc := coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line');
    insert into invoice_items(invoice_id,product_id,description,quantity,unit_price,discount,vat_rate,line_total)
    values (v_id,v_prod,v_desc,v_qty,v_price,v_ldisc,v_rate,v_line);
    v_sub := v_sub + round(v_qty*v_price,2); v_disc := v_disc + v_ldisc; v_vat := v_vat + round(v_line*v_rate,2);
    if v_prod is not null then
      select coalesce((select avg_cost from inventory_balances where product_id=v_prod and company_id=p_company limit 1), cost) into v_cost from products where id=v_prod;
      v_cogs := v_cogs + round(v_qty*coalesce(v_cost,0),2);
      if p_post then perform move_inventory(p_company,v_prod,-v_qty,v_cost,'sales_issue','invoice',v_id,p_invoice_date); end if;
    end if;
  end loop;
  update invoices set subtotal=v_sub, discount=v_disc, vat=v_vat, total=round(v_sub-v_disc+v_vat,2), balance=round(v_sub-v_disc+v_vat,2), cogs=v_cogs,
    status = case when p_post then 'posted'::doc_status else 'draft'::doc_status end where id=v_id;
  if p_post then perform post_invoice(v_id); end if;
  return v_id;
end $$;

-- ---------- post a draft invoice ----------
create or replace function public.post_draft_invoice(p_invoice uuid)
returns uuid language plpgsql set search_path to 'public' as $$
declare inv invoices%rowtype; r record; v_cost numeric; v_cogs numeric:=0;
begin
  select * into inv from invoices where id=p_invoice;
  if inv.status <> 'draft' then raise exception 'Only draft invoices can be posted'; end if;
  for r in select * from invoice_items where invoice_id=p_invoice and product_id is not null loop
    select coalesce((select avg_cost from inventory_balances where product_id=r.product_id limit 1), cost) into v_cost from products where id=r.product_id;
    v_cogs := v_cogs + round(r.quantity*coalesce(v_cost,0),2);
    perform move_inventory(inv.company_id,r.product_id,-r.quantity,v_cost,'sales_issue','invoice',inv.id,inv.invoice_date);
  end loop;
  update invoices set cogs=v_cogs, status='posted' where id=p_invoice;
  return post_invoice(p_invoice);
end $$;

-- ---------- customer receipt ----------
create or replace function public.record_customer_payment(p_invoice uuid, p_amount numeric, p_date date, p_method text default 'bank_transfer', p_bank_account uuid default null, p_reference text default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare inv invoices%rowtype; v_id uuid; v_num text; v_bank uuid; v_short numeric; v_tol_abs numeric; v_tol_pct numeric; cust text; v_exc text;
begin
  select * into inv from invoices where id=p_invoice;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select name into cust from customers where id=inv.customer_id;
  v_bank := coalesce(p_bank_account,(select id from bank_accounts where company_id=inv.company_id order by name limit 1));
  v_num := next_doc_number(inv.company_id,'customer_payment');
  insert into customer_payments(company_id,number,customer_id,invoice_id,bank_account_id,payment_date,amount,method,reference,status)
  values (inv.company_id,v_num,inv.customer_id,inv.id,v_bank,p_date,p_amount,p_method,coalesce(p_reference,inv.number),'cleared') returning id into v_id;
  perform post_customer_payment(v_id);
  insert into bank_transactions(company_id,bank_account_id,txn_date,description,normalized_counterparty,reference,direction,amount,status,match_type,matched_entity_id,matched_label,confidence,reconciled,import_batch)
  values (inv.company_id,v_bank,p_date,'INWARD TT '||upper(cust)||' REF '||inv.number,cust,inv.number,'in',p_amount,'matched','invoice',inv.id,inv.number,100,true,'MANUAL');
  update bank_accounts set current_balance=current_balance+p_amount, ledger_balance=ledger_balance+p_amount, last_synced_at=now() where id=v_bank;

  -- automation: short payment beyond tolerance -> exception
  select * into inv from invoices where id=p_invoice;
  v_short := inv.balance;
  select coalesce((value->>'amount')::numeric,50) into v_tol_abs from settings where company_id=inv.company_id and key='payment_tolerance_absolute';
  select coalesce((value->>'percent')::numeric,0.5) into v_tol_pct from settings where company_id=inv.company_id and key='payment_tolerance_percent';
  if v_short > 0 and v_short <= greatest(coalesce(v_tol_abs,50), inv.total*coalesce(v_tol_pct,0.5)/100) then
    perform post_journal(inv.company_id,p_date,'Auto-absorbed payment difference on '||inv.number,'invoice',inv.id,inv.number,
      jsonb_build_array(jsonb_build_object('code','4050','desc','Tolerance write-down','debit',v_short,'credit',0),
                        jsonb_build_object('code','1100','desc',cust||' cleared','debit',0,'credit',v_short)));
    update invoices set balance=0, amount_paid=total, status='paid' where id=inv.id;
    insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
    values (inv.company_id,'auto_resolved','Short payment within tolerance absorbed on '||inv.number,'AED '||v_short||' written to sales discounts automatically',v_short,'FIN','invoice',inv.id);
  elsif v_short > 0 and p_amount < inv.total then
    v_exc := next_doc_number(inv.company_id,'exception');
    insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,accounting_impact,status,due_date)
    values (inv.company_id,v_exc,'payment_difference','Underpayment on '||inv.number||' — '||cust,
      case when v_short > 1000 then 'high'::exception_priority else 'medium'::exception_priority end,'Receipts',
      'invoice',inv.id,inv.number,v_short,
      cust||' paid AED '||p_amount||' against AED '||inv.total||'. Remaining AED '||v_short||' exceeds the automatic tolerance.',
      'Difference is above the configured tolerance so FIN did not absorb it.',
      'Confirm whether a discount was agreed; otherwise keep outstanding and chase.',72,
      '["record_discount","keep_outstanding","write_off","credit_note","investigate"]'::jsonb,
      jsonb_build_array(jsonb_build_object('code','4050','name','Sales Discounts','debit',v_short,'credit',0),jsonb_build_object('code','1100','name','Accounts Receivable','debit',0,'credit',v_short)),
      'open', p_date + 7);
  end if;
  return v_id;
end $$;

-- ---------- purchase order ----------
create or replace function public.create_purchase_order(p_company uuid, p_supplier uuid, p_order_date date, p_expected date, p_items jsonb)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; it jsonb; v_sub numeric:=0; v_vat numeric:=0; v_line numeric; v_qty numeric; v_price numeric; v_rate numeric; v_prod uuid;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Order needs at least one line'; end if;
  insert into purchase_orders(company_id,number,supplier_id,order_date,expected_date,subtotal,vat,total,status)
  values (p_company,next_doc_number(p_company,'purchase_order'),p_supplier,p_order_date,p_expected,0,0,0,'confirmed') returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1); v_price := coalesce((it->>'unit_price')::numeric,0); v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    v_line := round(v_qty*v_price,2);
    insert into purchase_order_items(purchase_order_id,product_id,description,quantity,unit_price,vat_rate,line_total)
    values (v_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_rate,v_line);
    v_sub := v_sub + v_line; v_vat := v_vat + round(v_line*v_rate,2);
  end loop;
  update purchase_orders set subtotal=v_sub, vat=v_vat, total=round(v_sub+v_vat,2) where id=v_id;
  return v_id;
end $$;

-- ---------- supplier bill ----------
create or replace function public.create_supplier_bill(p_company uuid, p_supplier uuid, p_bill_date date, p_due_date date, p_items jsonb, p_supplier_ref text default null, p_purchase_order uuid default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; it jsonb; v_sub numeric:=0; v_vat numeric:=0; v_line numeric; v_qty numeric; v_price numeric; v_rate numeric; v_prod uuid; v_due date;
        po purchase_orders%rowtype; v_diff numeric; v_tol_abs numeric; v_tol_pct numeric; v_match text:='matched'; v_gr uuid; sup text;
begin
  if jsonb_array_length(coalesce(p_items,'[]'::jsonb)) = 0 then raise exception 'Bill needs at least one line'; end if;
  select name into sup from suppliers where id=p_supplier;
  v_due := coalesce(p_due_date, p_bill_date + coalesce((select payment_terms_days from suppliers where id=p_supplier),30));
  insert into supplier_bills(company_id,number,supplier_ref,supplier_id,purchase_order_id,bill_date,due_date,subtotal,vat,total,amount_paid,balance,match_status,status)
  values (p_company,next_doc_number(p_company,'supplier_bill'),p_supplier_ref,p_supplier,p_purchase_order,p_bill_date,v_due,0,0,0,0,0,'pending','posted') returning id into v_id;
  for it in select * from jsonb_array_elements(p_items) loop
    v_prod := nullif(it->>'product_id','')::uuid;
    v_qty := coalesce((it->>'quantity')::numeric,1); v_price := coalesce((it->>'unit_price')::numeric,0); v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
    v_line := round(v_qty*v_price,2);
    insert into supplier_bill_items(supplier_bill_id,product_id,description,quantity,unit_price,vat_rate,line_total)
    values (v_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_rate,v_line);
    v_sub := v_sub + v_line; v_vat := v_vat + round(v_line*v_rate,2);
    if v_prod is not null then perform move_inventory(p_company,v_prod,v_qty,v_price,'purchase_receipt','supplier_bill',v_id,p_bill_date); end if;
  end loop;
  -- goods receipt + three-way match
  if p_purchase_order is not null then
    select * into po from purchase_orders where id=p_purchase_order;
    insert into goods_receipts(company_id,number,purchase_order_id,supplier_id,receipt_date,total_value,status)
    values (p_company,next_doc_number(p_company,'goods_receipt'),p_purchase_order,p_supplier,p_bill_date,v_sub,'received') returning id into v_gr;
    update purchase_orders set status='posted' where id=p_purchase_order;
    v_diff := round(v_sub - po.subtotal,2);
    select coalesce((value->>'amount')::numeric,100) into v_tol_abs from settings where company_id=p_company and key='three_way_match_tolerance';
    select coalesce((value->>'percent')::numeric,1) into v_tol_pct from settings where company_id=p_company and key='three_way_match_tolerance';
    if abs(v_diff) > greatest(coalesce(v_tol_abs,100), po.subtotal*coalesce(v_tol_pct,1)/100) then
      v_match := 'mismatch';
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'three_way_mismatch','Bill differs from PO — '||sup,'high','Accounts payable','supplier_bill',v_id,
        (select number from supplier_bills where id=v_id),abs(v_diff),
        'Bill subtotal AED '||v_sub||' vs PO '||po.number||' AED '||po.subtotal||' (difference AED '||v_diff||').',
        'Difference exceeds the three-way match tolerance.',
        case when v_diff > 0 then 'Request a supplier credit note or approve the price increase.' else 'Recognise the saving and approve for payment.' end,
        80,'["supplier_credit","keep_outstanding","investigate","dismiss"]'::jsonb,'open',p_bill_date+5);
    end if;
  end if;
  update supplier_bills set subtotal=v_sub, vat=v_vat, total=round(v_sub+v_vat,2), balance=round(v_sub+v_vat,2), match_status=v_match, goods_receipt_id=v_gr where id=v_id;
  perform post_supplier_bill(v_id);
  return v_id;
end $$;

-- ---------- supplier payment ----------
create or replace function public.record_supplier_payment(p_bill uuid, p_amount numeric, p_date date, p_method text default 'bank_transfer', p_bank_account uuid default null, p_reference text default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare b supplier_bills%rowtype; v_id uuid; v_bank uuid; sup text;
begin
  select * into b from supplier_bills where id=p_bill;
  if b.id is null then raise exception 'Bill not found'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  select name into sup from suppliers where id=b.supplier_id;
  v_bank := coalesce(p_bank_account,(select id from bank_accounts where company_id=b.company_id order by name limit 1));
  insert into supplier_payments(company_id,number,supplier_id,supplier_bill_id,bank_account_id,payment_date,amount,method,reference)
  values (b.company_id,next_doc_number(b.company_id,'supplier_payment'),b.supplier_id,b.id,v_bank,p_date,p_amount,p_method,coalesce(p_reference,b.number)) returning id into v_id;
  perform post_supplier_payment(v_id);
  insert into bank_transactions(company_id,bank_account_id,txn_date,description,normalized_counterparty,reference,direction,amount,status,match_type,matched_entity_id,matched_label,confidence,reconciled,import_batch)
  values (b.company_id,v_bank,p_date,'OUTWARD TT '||upper(sup)||' REF '||b.number,sup,b.number,'out',p_amount,'matched','bill',b.id,b.number,100,true,'MANUAL');
  update bank_accounts set current_balance=current_balance-p_amount, ledger_balance=ledger_balance-p_amount, last_synced_at=now() where id=v_bank;
  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (b.company_id,'payment_sent','Paid '||sup,'Against '||b.number,p_amount,'System','supplier_payment',v_id);
  return v_id;
end $$;

-- ---------- expense ----------
create or replace function public.create_expense(p_company uuid, p_merchant text, p_date date, p_gross numeric, p_category uuid default null, p_employee text default null, p_method text default 'company_card', p_has_document boolean default false, p_project text default null, p_bank_account uuid default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare v_id uuid; v_rate numeric; v_net numeric; v_vat numeric; v_bank uuid; v_limit numeric; v_req boolean;
begin
  if p_gross <= 0 then raise exception 'Amount must be positive'; end if;
  select coalesce((value->>'rate')::numeric,0.05) into v_rate from settings where company_id=p_company and key='default_vat_rate';
  v_rate := coalesce(v_rate,0.05);
  v_net := round(p_gross/(1+v_rate),2); v_vat := round(p_gross - v_net,2);
  insert into expenses(company_id,number,merchant,expense_date,amount,vat,category_id,employee,project,payment_method,source,has_document,status)
  values (p_company,next_doc_number(p_company,'expense'),p_merchant,p_date,v_net,v_vat,p_category,p_employee,p_project,p_method,'manual',p_has_document,'posted') returning id into v_id;
  perform post_expense(v_id);
  v_bank := coalesce(p_bank_account,(select id from bank_accounts where company_id=p_company order by name limit 1));
  insert into bank_transactions(company_id,bank_account_id,txn_date,description,normalized_counterparty,reference,direction,amount,status,match_type,matched_entity_id,matched_label,confidence,reconciled,import_batch)
  values (p_company,v_bank,p_date,upper(p_method)||' '||upper(p_merchant),p_merchant,(select number from expenses where id=v_id),'out',p_gross,'matched','expense',v_id,(select number from expenses where id=v_id),100,true,'MANUAL');
  update bank_accounts set current_balance=current_balance-p_gross, ledger_balance=ledger_balance-p_gross where id=v_bank;
  select (value->>'above')::numeric, coalesce((value->>'enabled')::boolean,true) into v_limit, v_req from settings where company_id=p_company and key='require_document_for_expense';
  if coalesce(v_req,true) and not p_has_document and v_net > coalesce(v_limit,100) then
    insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
    values (p_company,next_doc_number(p_company,'exception'),'missing_receipt','Receipt missing — '||p_merchant,'low','Expense policy','expense',v_id,(select number from expenses where id=v_id),v_net,
      'Expense of AED '||v_net||' captured without a supporting document.','Policy requires a receipt above AED '||coalesce(v_limit,100)||'.','Ask '||coalesce(p_employee,'the submitter')||' to upload the receipt.',95,'["investigate","dismiss"]'::jsonb,'open',p_date+14);
  end if;
  return v_id;
end $$;

-- ---------- void ----------
create or replace function public.void_document(p_type text, p_id uuid, p_reason text default 'Voided by user')
returns void language plpgsql set search_path to 'public' as $$
declare je journal_entries%rowtype; v_new uuid; l record; v_company uuid; v_label text; r record;
begin
  for je in select * from journal_entries where ref_type=p_type and ref_id=p_id and not is_reversal and id not in (select coalesce(reverses_id,'00000000-0000-0000-0000-000000000000'::uuid) from journal_entries) loop
    v_company := je.company_id; v_label := je.ref_label;
    insert into journal_entries(company_id,number,entry_date,memo,source,ref_type,ref_id,ref_label,total_debit,total_credit,is_reversal,reverses_id)
    values (je.company_id,'JE-'||lpad(((select count(*) from journal_entries where company_id=je.company_id)+1)::text,5,'0'),current_date,'Reversal of '||je.number||' — '||p_reason,'void',je.ref_type,je.ref_id,je.ref_label,je.total_credit,je.total_debit,true,je.id) returning id into v_new;
    for l in select * from journal_entry_lines where journal_entry_id=je.id loop
      insert into journal_entry_lines(journal_entry_id,account_code,account_name,description,debit,credit) values (v_new,l.account_code,l.account_name,'Reversal: '||coalesce(l.description,''),l.credit,l.debit);
    end loop;
  end loop;
  if p_type='invoice' then
    select company_id, number into v_company, v_label from invoices where id=p_id;
    for r in select it.*, i.company_id, i.invoice_date from invoice_items it join invoices i on i.id=it.invoice_id where it.invoice_id=p_id and it.product_id is not null and i.status<>'draft' loop
      perform move_inventory(r.company_id,r.product_id,r.quantity,null,'sales_return','invoice',p_id,current_date);
    end loop;
    update invoices set status='cancelled', balance=0 where id=p_id;
  elsif p_type='supplier_bill' then
    select company_id, number into v_company, v_label from supplier_bills where id=p_id;
    for r in select it.*, b.company_id from supplier_bill_items it join supplier_bills b on b.id=it.supplier_bill_id where it.supplier_bill_id=p_id and it.product_id is not null loop
      perform move_inventory(r.company_id,r.product_id,-r.quantity,r.unit_price,'purchase_return','supplier_bill',p_id,current_date);
    end loop;
    update supplier_bills set status='cancelled', balance=0 where id=p_id;
  elsif p_type='expense' then
    select company_id, number into v_company, v_label from expenses where id=p_id;
    update expenses set status='cancelled' where id=p_id;
  elsif p_type='purchase_order' then
    select company_id, number into v_company, v_label from purchase_orders where id=p_id;
    update purchase_orders set status='cancelled' where id=p_id;
  end if;
  update exceptions set status='dismissed', resolved_at=now(), resolution='Source document voided' where entity_id=p_id and status in ('open','in_review','waiting');
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (v_company,'User','Voided '||p_type,p_type,p_id,v_label,jsonb_build_object('reason',p_reason),'ui');
  insert into activity_feed(company_id,kind,title,detail,actor,entity_type,entity_id)
  values (v_company,'document_voided',initcap(replace(p_type,'_',' '))||' '||coalesce(v_label,'')||' voided',p_reason,'User',p_type,p_id);
end $$;

-- ---------- period report ----------
create or replace function public.report_period(p_company uuid, p_from date, p_to date)
returns table(code text, name text, type account_type, subtype text, opening numeric, movement numeric, debit numeric, credit numeric)
language sql stable set search_path to 'public' as $$
  select a.code, a.name, a.type, a.subtype,
    coalesce(sum(case when e.entry_date < p_from then l.debit - l.credit end),0) as opening,
    coalesce(sum(case when e.entry_date between p_from and p_to then l.debit - l.credit end),0) as movement,
    coalesce(sum(case when e.entry_date between p_from and p_to then l.debit end),0) as debit,
    coalesce(sum(case when e.entry_date between p_from and p_to then l.credit end),0) as credit
  from accounts a
  left join journal_entry_lines l on l.account_code = a.code
  left join journal_entries e on e.id = l.journal_entry_id and e.company_id = a.company_id
  where a.company_id = p_company and not a.is_group
  group by a.code, a.name, a.type, a.subtype
  order by a.code
$$;

-- ---------- period close ----------
create or replace function public.set_period_closed(p_period uuid, p_closed boolean)
returns void language sql set search_path to 'public' as $$
  update accounting_periods set is_closed = p_closed where id = p_period;
$$;

-- ---------- automation run ----------
create or replace function public.run_automation(p_company uuid)
returns jsonb language plpgsql set search_path to 'public' as $$
declare r record; v_created int:=0; v_marked int:=0; v_matched int:=0; cust text; v_conf numeric;
begin
  -- 1. overdue invoices
  for r in select i.*, c.name as cname from invoices i join customers c on c.id=i.customer_id
           where i.company_id=p_company and i.balance>0 and i.status not in ('cancelled','draft') and i.due_date < current_date
             and not exists (select 1 from exceptions x where x.entity_id=i.id and x.type='overdue_receivable' and x.status in ('open','in_review','waiting')) loop
    if r.status <> 'overdue' then update invoices set status='overdue' where id=r.id; v_marked := v_marked+1; end if;
    if current_date - r.due_date >= 14 then
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'overdue_receivable',r.number||' overdue '||(current_date-r.due_date)||' days — '||r.cname,
        case when current_date-r.due_date>60 then 'critical' when current_date-r.due_date>30 then 'high' else 'medium' end::exception_priority,
        'Credit control','invoice',r.id,r.number,r.balance,r.cname||' has not settled AED '||r.balance||' due '||to_char(r.due_date,'DD Mon'),'Past due beyond the 14-day grace window.',
        'Send reminder; place account on hold if >60 days.',90,'["keep_outstanding","write_off","credit_note","investigate","dismiss"]'::jsonb,'open',current_date+3);
      v_created := v_created+1;
    end if;
  end loop;
  -- 2. supplier bills due within 7 days
  for r in select b.*, s.name as sname from supplier_bills b join suppliers s on s.id=b.supplier_id
           where b.company_id=p_company and b.balance>0 and b.status not in ('cancelled') and b.due_date between current_date and current_date+7
             and not exists (select 1 from exceptions x where x.entity_id=b.id and x.type='payment_due' and x.status in ('open','in_review','waiting')) loop
    insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
    values (p_company,next_doc_number(p_company,'exception'),'payment_due','Payment due — '||r.sname||' '||r.number,'medium','Payables scheduler','supplier_bill',r.id,r.number,r.balance,
      'AED '||r.balance||' falls due on '||to_char(r.due_date,'DD Mon')||'.','Approval threshold requires a human release for outgoing payments.','Approve payment run or defer with supplier agreement.',88,'["investigate","keep_outstanding","dismiss"]'::jsonb,'open',r.due_date);
    v_created := v_created+1;
  end loop;
  -- 3. low stock
  for r in select p.*, coalesce(sum(ib.quantity),0) as qty from products p left join inventory_balances ib on ib.product_id=p.id
           where p.company_id=p_company and p.reorder_level>0 group by p.id having coalesce(sum(ib.quantity),0) < p.reorder_level loop
    if not exists (select 1 from exceptions x where x.entity_id=r.id and x.type='low_stock' and x.status in ('open','in_review','waiting')) then
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'low_stock','Below reorder level — '||r.sku,'medium','Inventory','product',r.id,r.sku,round(r.reorder_level*r.cost,2),
        r.name||' has '||r.qty||' '||r.unit||' on hand vs reorder level '||r.reorder_level||'.','Stock below threshold.','Raise a purchase order for '||(r.reorder_level*2)||' '||r.unit||'.',85,'["investigate","dismiss"]'::jsonb,'open',current_date+5);
      v_created := v_created+1;
    end if;
  end loop;
  -- 4. auto-match unmatched bank lines by exact reference + amount
  for r in select t.* from bank_transactions t where t.company_id=p_company and t.status<>'matched' loop
    if r.direction='in' then
      update bank_transactions set status='matched', match_type='invoice', matched_entity_id=i.id, matched_label=i.number, confidence=99, reconciled=true
      from invoices i where bank_transactions.id=r.id and i.company_id=p_company and i.balance>0 and abs(i.balance-r.amount)<0.01 and position(i.number in r.description)>0;
      if found then v_matched := v_matched+1; end if;
    else
      update bank_transactions set status='matched', match_type='bill', matched_entity_id=b.id, matched_label=b.number, confidence=99, reconciled=true
      from supplier_bills b where bank_transactions.id=r.id and b.company_id=p_company and b.balance>0 and abs(b.balance-r.amount)<0.01 and position(b.number in r.description)>0;
      if found then v_matched := v_matched+1; end if;
    end if;
  end loop;
  -- 5. stale unmatched bank lines
  for r in select * from bank_transactions where company_id=p_company and status='unmatched' and txn_date < current_date-5
           and not exists (select 1 from exceptions x where x.entity_id=bank_transactions.id and x.status in ('open','in_review','waiting')) loop
    insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
    values (p_company,next_doc_number(p_company,'exception'),case when r.direction='in' then 'unidentified_receipt' else 'unidentified_payment' end,
      case when r.direction='in' then 'Unidentified receipt' else 'Unidentified payment' end||' — AED '||r.amount,'medium','Bank reconciliation','bank_transaction',r.id,left(r.description,40),r.amount,
      r.description||' on '||to_char(r.txn_date,'DD Mon')||' has no matching document.','No invoice, bill or expense matched on reference or amount.','Identify the counterparty or post to suspense.',60,'["investigate","keep_outstanding","dismiss"]'::jsonb,'open',current_date+2);
    v_created := v_created+1;
  end loop;
  insert into activity_feed(company_id,kind,title,detail,actor)
  values (p_company,'automation_run','Automation cycle completed',v_created||' new exceptions, '||v_matched||' bank lines auto-matched, '||v_marked||' invoices marked overdue','FIN');
  return jsonb_build_object('created',v_created,'matched',v_matched,'marked_overdue',v_marked);
end $$;