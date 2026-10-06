CREATE TABLE public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  number text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sales_credit','purchase_debit')),
  customer_id uuid REFERENCES public.customers(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  invoice_id uuid REFERENCES public.invoices(id),
  supplier_bill_id uuid REFERENCES public.supplier_bills(id),
  note_date date NOT NULL,
  reason text,
  subtotal numeric NOT NULL DEFAULT 0,
  vat numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  applied numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'posted',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.credit_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  description text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0.05,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_items TO authenticated;
GRANT ALL ON public.credit_note_items TO service_role;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON public.credit_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON public.credit_note_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX credit_notes_company_idx ON public.credit_notes(company_id, kind, note_date);

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS tax_code text NOT NULL DEFAULT 'VAT5';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0.05;

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
    when 'credit_note' then select coalesce(max(substring(number from '\d+$')::int),11000) into v_max from credit_notes where company_id=p_company and kind='sales_credit'; v_prefix:='CN-';
    when 'debit_note' then select coalesce(max(substring(number from '\d+$')::int),71000) into v_max from credit_notes where company_id=p_company and kind='purchase_debit'; v_prefix:='DBN-';
    else raise exception 'Unknown doc kind %', p_kind;
  end case;
  return v_prefix || (v_max + 1)::text;
end $function$;

CREATE OR REPLACE FUNCTION public.create_credit_note(p_company uuid, p_kind text, p_party uuid, p_doc uuid, p_date date, p_reason text, p_items jsonb)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_id uuid; v_num text; v_sub numeric := 0; v_vat numeric := 0; v_tot numeric; v_it jsonb; v_q numeric; v_p numeric; v_r numeric;
  v_name text; v_bal numeric; v_apply numeric := 0; v_doclabel text;
begin
  if p_kind not in ('sales_credit','purchase_debit') then raise exception 'Unknown note type'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one line'; end if;
  if p_kind = 'sales_credit' then
    select name into v_name from customers where id = p_party and company_id = p_company;
    if v_name is null then raise exception 'Choose a customer'; end if;
  else
    select name into v_name from suppliers where id = p_party and company_id = p_company;
    if v_name is null then raise exception 'Choose a supplier'; end if;
  end if;
  v_num := next_doc_number(p_company, case when p_kind='sales_credit' then 'credit_note' else 'debit_note' end);
  insert into credit_notes(company_id, number, kind, customer_id, supplier_id, invoice_id, supplier_bill_id, note_date, reason)
  values (p_company, v_num, p_kind,
    case when p_kind='sales_credit' then p_party end, case when p_kind='purchase_debit' then p_party end,
    case when p_kind='sales_credit' then p_doc end, case when p_kind='purchase_debit' then p_doc end,
    p_date, p_reason) returning id into v_id;
  for v_it in select * from jsonb_array_elements(p_items) loop
    v_q := coalesce((v_it->>'quantity')::numeric,0); v_p := coalesce((v_it->>'unit_price')::numeric,0); v_r := coalesce((v_it->>'vat_rate')::numeric,0.05);
    if v_q <= 0 then continue; end if;
    insert into credit_note_items(credit_note_id, product_id, description, quantity, unit_price, vat_rate, line_total)
    values (v_id, nullif(v_it->>'product_id','')::uuid, v_it->>'description', v_q, v_p, v_r, round(v_q*v_p,2));
    v_sub := v_sub + round(v_q*v_p,2); v_vat := v_vat + round(v_q*v_p*v_r,2);
  end loop;
  v_tot := v_sub + v_vat;
  if v_tot <= 0 then raise exception 'The note total must be greater than zero'; end if;

  if p_kind = 'sales_credit' then
    perform post_journal(p_company, p_date, 'Credit note '||v_num||' — '||v_name, 'credit_note', v_id, v_num, jsonb_build_array(
      jsonb_build_object('code','4000','desc','Sales credit — '||coalesce(p_reason,''),'debit',v_sub,'credit',0),
      jsonb_build_object('code','2100','desc','VAT output reversed','debit',v_vat,'credit',0),
      jsonb_build_object('code','1100','desc',v_name,'debit',0,'credit',v_tot)));
    if p_doc is not null then
      select balance, number into v_bal, v_doclabel from invoices where id = p_doc and customer_id = p_party for update;
      if v_doclabel is null then raise exception 'The invoice does not belong to this customer'; end if;
      v_apply := least(v_tot, greatest(v_bal,0));
      if v_apply > 0 then
        update invoices set amount_paid = amount_paid + v_apply, balance = balance - v_apply,
          status = case when balance - v_apply <= 0.005 then 'paid'::doc_status else 'partially_paid'::doc_status end where id = p_doc;
      end if;
    end if;
  else
    perform post_journal(p_company, p_date, 'Debit note '||v_num||' — '||v_name, 'debit_note', v_id, v_num, jsonb_build_array(
      jsonb_build_object('code','2000','desc',v_name,'debit',v_tot,'credit',0),
      jsonb_build_object('code','1210','desc','Purchase return — '||coalesce(p_reason,''),'debit',0,'credit',v_sub),
      jsonb_build_object('code','1400','desc','VAT input reversed','debit',0,'credit',v_vat)));
    if p_doc is not null then
      select balance, number into v_bal, v_doclabel from supplier_bills where id = p_doc and supplier_id = p_party for update;
      if v_doclabel is null then raise exception 'The bill does not belong to this supplier'; end if;
      v_apply := least(v_tot, greatest(v_bal,0));
      if v_apply > 0 then
        update supplier_bills set amount_paid = amount_paid + v_apply, balance = balance - v_apply,
          status = case when balance - v_apply <= 0.005 then 'paid'::doc_status else 'partially_paid'::doc_status end where id = p_doc;
      end if;
    end if;
  end if;
  update credit_notes set subtotal = v_sub, vat = v_vat, total = v_tot, applied = v_apply where id = v_id;
  insert into activity_feed(company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (p_company, p_kind, (case when p_kind='sales_credit' then 'Credit note ' else 'Debit note ' end)||v_num||' posted', v_name, v_tot, 'Ahmed Rahman', 'credit_note', v_id);
  return v_id;
end $function$;
REVOKE EXECUTE ON FUNCTION public.create_credit_note(uuid,text,uuid,uuid,date,text,jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_credit_note(uuid,text,uuid,uuid,date,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_expense(p_expense uuid)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare e public.expenses%rowtype; acct text; v_lines jsonb; v_rcm boolean;
begin
  select * into e from public.expenses where id = p_expense;
  select coalesce(account_code,'6500') into acct from public.expense_categories where id = e.category_id;
  v_rcm := e.tax_code = 'RCM';
  v_lines := jsonb_build_array(jsonb_build_object('code', coalesce(acct,'6500'),'desc', e.merchant,'debit', e.amount,'credit',0));
  if e.vat > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('code','1400','desc','VAT input '||e.tax_code,'debit', e.vat,'credit',0));
  end if;
  if v_rcm then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('code','2100','desc','Reverse charge VAT output','debit',0,'credit', e.vat),
      jsonb_build_object('code','1000','desc','Paid from bank','debit',0,'credit', e.amount));
  else
    v_lines := v_lines || jsonb_build_array(jsonb_build_object('code','1000','desc','Paid from bank','debit',0,'credit', e.amount + e.vat));
  end if;
  return public.post_journal(e.company_id, e.expense_date, 'Expense '||e.number||' — '||e.merchant, 'expense', e.id, e.number, v_lines);
end $function$;

DROP FUNCTION IF EXISTS public.create_expense(uuid,text,date,numeric,uuid,text,text,boolean,text,uuid);
CREATE FUNCTION public.create_expense(p_company uuid, p_merchant text, p_date date, p_gross numeric, p_category uuid DEFAULT NULL, p_employee text DEFAULT NULL, p_method text DEFAULT 'company_card', p_has_document boolean DEFAULT false, p_project text DEFAULT NULL, p_bank_account uuid DEFAULT NULL, p_tax_rate uuid DEFAULT NULL)
 RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
declare v_id uuid; v_rate numeric; v_code text; v_net numeric; v_vat numeric; v_bank uuid; v_limit numeric; v_req boolean;
begin
  if p_gross <= 0 then raise exception 'Amount must be positive'; end if;
  if p_tax_rate is not null then
    select rate, code into v_rate, v_code from tax_rates where id = p_tax_rate and company_id = p_company;
    if v_code is null then raise exception 'Choose a valid VAT rate'; end if;
  else
    select rate, code into v_rate, v_code from tax_rates where company_id = p_company and is_default order by code limit 1;
  end if;
  v_rate := coalesce(v_rate,0.05); v_code := coalesce(v_code,'VAT5');
  if v_code = 'RCM' then
    v_net := round(p_gross,2); v_vat := round(p_gross*v_rate,2);
  else
    v_net := round(p_gross/(1+v_rate),2); v_vat := round(p_gross - v_net,2);
  end if;
  insert into expenses(company_id,number,merchant,expense_date,amount,vat,category_id,employee,project,payment_method,source,has_document,status,tax_code,vat_rate)
  values (p_company,next_doc_number(p_company,'expense'),p_merchant,p_date,v_net,v_vat,p_category,p_employee,p_project,p_method,'manual',p_has_document,'posted',v_code,v_rate) returning id into v_id;
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
end $function$;
REVOKE EXECUTE ON FUNCTION public.create_expense(uuid,text,date,numeric,uuid,text,text,boolean,text,uuid,uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_expense(uuid,text,date,numeric,uuid,text,text,boolean,text,uuid,uuid) TO authenticated;