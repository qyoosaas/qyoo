
-- ============ BANKING: import, allocate, reconcile ============

create or replace function public.import_bank_transactions(
  p_company uuid, p_bank_account uuid, p_rows jsonb, p_batch text default null
) returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  it jsonb; v_batch text; v_imported int := 0; v_dupes int := 0; v_sugg int := 0;
  v_date date; v_desc text; v_ref text; v_amt numeric; v_dir text; v_bal numeric;
  v_match_id uuid; v_match_label text; v_match_type text; v_conf numeric;
begin
  if p_bank_account is null then raise exception 'Choose a bank account to import into'; end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) = 0 then raise exception 'No statement lines found to import'; end if;
  v_batch := coalesce(nullif(p_batch,''), 'IMP-'||to_char(now(),'YYYYMMDDHH24MISS'));

  for it in select * from jsonb_array_elements(p_rows) loop
    v_date := nullif(it->>'txn_date','')::date;
    v_desc := coalesce(nullif(it->>'description',''),'Bank line');
    v_ref  := nullif(it->>'reference','');
    v_amt  := coalesce((it->>'amount')::numeric,0);
    v_bal  := nullif(it->>'balance_after','')::numeric;
    v_dir  := coalesce(nullif(it->>'direction',''), case when v_amt < 0 then 'out' else 'in' end);
    v_amt  := abs(v_amt);
    if v_date is null or v_amt = 0 then continue; end if;

    if exists (
      select 1 from bank_transactions
      where bank_account_id = p_bank_account and txn_date = v_date
        and round(amount,2) = round(v_amt,2) and direction = v_dir and description = v_desc
    ) then
      v_dupes := v_dupes + 1;
      continue;
    end if;

    v_match_id := null; v_match_label := null; v_match_type := null; v_conf := null;

    if v_dir = 'in' then
      select i.id, i.number, 'invoice', case when round(i.balance,2) = round(v_amt,2) then 96 else 78 end
        into v_match_id, v_match_label, v_match_type, v_conf
      from invoices i
      where i.company_id = p_company and i.balance > 0 and i.status <> 'cancelled'
        and (coalesce(v_ref,'') ilike '%'||i.number||'%' or v_desc ilike '%'||i.number||'%' or round(i.balance,2) = round(v_amt,2))
      order by (round(i.balance,2) = round(v_amt,2)) desc, i.invoice_date desc
      limit 1;
    else
      select b.id, b.number, 'bill', case when round(b.balance,2) = round(v_amt,2) then 96 else 78 end
        into v_match_id, v_match_label, v_match_type, v_conf
      from supplier_bills b
      where b.company_id = p_company and b.balance > 0 and b.status <> 'cancelled'
        and (coalesce(v_ref,'') ilike '%'||b.number||'%' or v_desc ilike '%'||b.number||'%' or round(b.balance,2) = round(v_amt,2))
      order by (round(b.balance,2) = round(v_amt,2)) desc, b.bill_date desc
      limit 1;
    end if;

    insert into bank_transactions(company_id,bank_account_id,txn_date,description,normalized_counterparty,reference,
                                  direction,amount,balance_after,status,match_type,matched_entity_id,matched_label,
                                  confidence,reconciled,import_batch)
    values (p_company,p_bank_account,v_date,v_desc,nullif(initcap(regexp_replace(v_desc,'[^a-zA-Z ]','','g')),''),v_ref,
            v_dir,v_amt,v_bal,
            case when v_match_id is null then 'unmatched' else 'suggested' end,
            case when v_match_id is null then null else 'suggested' end,
            v_match_id,v_match_label,v_conf,false,v_batch);

    v_imported := v_imported + 1;
    if v_match_id is not null then v_sugg := v_sugg + 1; end if;
  end loop;

  update bank_accounts set last_synced_at = now() where id = p_bank_account;

  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (p_company,'bank_import','Bank statement imported ('||v_batch||')',
          v_imported||' new lines, '||v_dupes||' duplicates skipped, '||v_sugg||' pre-matched',
          null,'System','bank_account',p_bank_account);
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (p_company,'System','Bank statement imported','bank_account',p_bank_account,v_batch,
          jsonb_build_object('imported',v_imported,'duplicates',v_dupes,'suggested',v_sugg),'banking');

  return jsonb_build_object('imported',v_imported,'duplicates',v_dupes,'suggested',v_sugg,'batch',v_batch);
end $$;

create or replace function public.allocate_bank_transaction(
  p_txn uuid, p_kind text, p_target uuid default null, p_account_code text default null, p_actor text default 'Ahmed Rahman'
) returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  t bank_transactions%rowtype; v_payment uuid; v_label text; v_start timestamptz := clock_timestamp();
  v_acct text; v_je uuid;
begin
  select * into t from bank_transactions where id = p_txn;
  if t.id is null then raise exception 'Bank line not found'; end if;
  if t.reconciled then raise exception 'This bank line is already allocated'; end if;

  if p_kind = 'invoice' then
    if p_target is null then raise exception 'Choose the invoice to settle'; end if;
    select number into v_label from invoices where id = p_target;
    if v_label is null then raise exception 'Invoice not found'; end if;
    v_payment := record_customer_payment(p_target, t.amount, t.txn_date, 'bank_transfer', t.bank_account_id, coalesce(t.reference, t.description));
    -- the payment routine mirrors its own bank line; drop it, this imported line is the real one
    delete from bank_transactions
      where import_batch = 'MANUAL' and matched_entity_id = p_target and created_at >= v_start;
    update bank_transactions set status='matched', match_type='manual', matched_entity_id=p_target,
           matched_label=v_label, confidence=100, reconciled=true where id = p_txn;

  elsif p_kind = 'bill' then
    if p_target is null then raise exception 'Choose the supplier bill to settle'; end if;
    select number into v_label from supplier_bills where id = p_target;
    if v_label is null then raise exception 'Supplier bill not found'; end if;
    v_payment := record_supplier_payment(p_target, t.amount, t.txn_date, 'bank_transfer', t.bank_account_id, coalesce(t.reference, t.description));
    delete from bank_transactions
      where import_batch = 'MANUAL' and matched_entity_id = p_target and created_at >= v_start;
    update bank_transactions set status='matched', match_type='manual', matched_entity_id=p_target,
           matched_label=v_label, confidence=100, reconciled=true where id = p_txn;

  elsif p_kind = 'gl' then
    v_acct := coalesce(nullif(p_account_code,''), case when t.direction='in' then '4100' else '6500' end);
    if not exists (select 1 from accounts where company_id=t.company_id and code=v_acct) then
      raise exception 'Ledger account % does not exist', v_acct;
    end if;
    v_je := post_journal(t.company_id, t.txn_date, 'Bank line — '||t.description, 'bank_transaction', t.id, coalesce(t.reference,t.description),
      case when t.direction='in'
        then jsonb_build_array(jsonb_build_object('code','1000','desc',t.description,'debit',t.amount,'credit',0),
                               jsonb_build_object('code',v_acct,'desc',t.description,'debit',0,'credit',t.amount))
        else jsonb_build_array(jsonb_build_object('code',v_acct,'desc',t.description,'debit',t.amount,'credit',0),
                               jsonb_build_object('code','1000','desc',t.description,'debit',0,'credit',t.amount))
      end, 'banking');
    update bank_accounts
      set current_balance = current_balance + case when t.direction='in' then t.amount else -t.amount end,
          ledger_balance  = ledger_balance  + case when t.direction='in' then t.amount else -t.amount end
      where id = t.bank_account_id;
    v_label := (select name from accounts where company_id=t.company_id and code=v_acct);
    update bank_transactions set status='matched', match_type='ledger', matched_entity_id=v_je,
           matched_label=v_acct||' '||v_label, confidence=100, reconciled=true where id = p_txn;
  else
    raise exception 'Unknown allocation type %', p_kind;
  end if;

  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (t.company_id,p_actor,'Bank line allocated','bank_transaction',t.id,coalesce(t.reference,t.description),
          jsonb_build_object('kind',p_kind,'target',coalesce(v_label,p_account_code),'amount',t.amount),'banking');

  return jsonb_build_object('payment', v_payment, 'journal', v_je, 'label', v_label);
end $$;

create or replace function public.unmatch_bank_transaction(p_txn uuid, p_actor text default 'Ahmed Rahman')
returns void
language plpgsql
set search_path to 'public'
as $$
declare t bank_transactions%rowtype;
begin
  select * into t from bank_transactions where id = p_txn;
  if t.id is null then raise exception 'Bank line not found'; end if;
  if t.match_type in ('manual','ledger') and t.reconciled then
    raise exception 'This line was allocated and posted to the ledger. Reverse the payment or journal instead of unmatching.';
  end if;
  update bank_transactions set status='unmatched', match_type=null, matched_entity_id=null,
         matched_label=null, confidence=null, reconciled=false where id = p_txn;
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,source)
  values (t.company_id,p_actor,'Bank line suggestion rejected','bank_transaction',t.id,coalesce(t.reference,t.description),'banking');
end $$;

create or replace function public.reconcile_bank_account(
  p_bank_account uuid, p_period_label text, p_statement_balance numeric, p_actor text default 'Ahmed Rahman'
) returns uuid
language plpgsql
set search_path to 'public'
as $$
declare a bank_accounts%rowtype; v_id uuid; v_matched int; v_unmatched int; v_diff numeric;
begin
  select * into a from bank_accounts where id = p_bank_account;
  if a.id is null then raise exception 'Bank account not found'; end if;

  select count(*) filter (where reconciled), count(*) filter (where not reconciled)
    into v_matched, v_unmatched
  from bank_transactions where bank_account_id = p_bank_account;

  v_diff := round(coalesce(p_statement_balance,0) - a.ledger_balance, 2);

  insert into bank_reconciliations(company_id,bank_account_id,period_label,statement_balance,ledger_balance,
                                   difference,matched_count,unmatched_count,status)
  values (a.company_id,a.id,p_period_label,coalesce(p_statement_balance,0),a.ledger_balance,v_diff,v_matched,v_unmatched,
          case when v_diff = 0 and v_unmatched = 0 then 'reconciled'
               when v_diff = 0 then 'in_progress' else 'difference' end)
  returning id into v_id;

  update bank_accounts
     set reconciliation_status = case when v_diff = 0 and v_unmatched = 0 then 'reconciled' else 'in_progress' end,
         last_synced_at = now()
   where id = a.id;

  insert into activity_feed(company_id,kind,title,detail,amount,actor,entity_type,entity_id)
  values (a.company_id,'reconciliation','Reconciliation saved for '||a.name||' — '||p_period_label,
          v_matched||' matched, '||v_unmatched||' open, difference AED '||v_diff,v_diff,p_actor,'bank_account',a.id);
  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,after,source)
  values (a.company_id,p_actor,'Bank reconciliation saved','bank_account',a.id,p_period_label,
          jsonb_build_object('statement',p_statement_balance,'ledger',a.ledger_balance,'difference',v_diff),'banking');

  return v_id;
end $$;

-- ============ SAFE DOCUMENT EDITING ============

create or replace function public.update_document(
  p_type text, p_id uuid, p_patch jsonb default '{}'::jsonb, p_items jsonb default null, p_actor text default 'Ahmed Rahman'
) returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_company uuid; v_label text; v_before jsonb; it jsonb;
  v_sub numeric := 0; v_disc numeric := 0; v_vat numeric := 0; v_line numeric;
  v_qty numeric; v_price numeric; v_ldisc numeric; v_rate numeric; v_prod uuid;
begin
  if p_type = 'purchase_order' then
    select company_id, number, to_jsonb(po) into v_company, v_label, v_before from purchase_orders po where id = p_id;
    if v_company is null then raise exception 'Purchase order not found'; end if;
    if exists (select 1 from goods_receipts where purchase_order_id = p_id)
       or exists (select 1 from supplier_bills where purchase_order_id = p_id) then
      raise exception 'This order already has a goods receipt or bill, so it can no longer be edited. Reverse those documents first.';
    end if;
    update purchase_orders set
      order_date = coalesce(nullif(p_patch->>'order_date','')::date, order_date),
      expected_date = coalesce(nullif(p_patch->>'expected_date','')::date, expected_date),
      supplier_id = coalesce(nullif(p_patch->>'supplier_id','')::uuid, supplier_id)
    where id = p_id;

    if p_items is not null then
      if jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one line'; end if;
      delete from purchase_order_items where purchase_order_id = p_id;
      for it in select * from jsonb_array_elements(p_items) loop
        v_prod := nullif(it->>'product_id','')::uuid;
        v_qty := coalesce((it->>'quantity')::numeric,1);
        v_price := coalesce((it->>'unit_price')::numeric,0);
        v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
        if v_qty <= 0 then continue; end if;
        v_line := round(v_qty*v_price,2);
        insert into purchase_order_items(purchase_order_id,product_id,description,quantity,unit_price,vat_rate,line_total)
        values (p_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_rate,v_line);
        v_sub := v_sub + v_line; v_vat := v_vat + round(v_line*v_rate,2);
      end loop;
      update purchase_orders set subtotal=v_sub, vat=v_vat, total=round(v_sub+v_vat,2) where id=p_id;
    end if;

  elsif p_type = 'sales_order' then
    select company_id, number, to_jsonb(so) into v_company, v_label, v_before from sales_orders so where id = p_id;
    if v_company is null then raise exception 'Sales order not found'; end if;
    if exists (select 1 from delivery_notes where sales_order_id = p_id)
       or exists (select 1 from invoices where sales_order_id = p_id) then
      raise exception 'This order already has a delivery note or invoice, so it can no longer be edited. Reverse those documents first.';
    end if;
    update sales_orders set
      order_date = coalesce(nullif(p_patch->>'order_date','')::date, order_date),
      expected_delivery = coalesce(nullif(p_patch->>'expected_delivery','')::date, expected_delivery),
      customer_id = coalesce(nullif(p_patch->>'customer_id','')::uuid, customer_id)
    where id = p_id;

    if p_items is not null then
      if jsonb_array_length(p_items) = 0 then raise exception 'An order needs at least one line'; end if;
      delete from sales_order_items where sales_order_id = p_id;
      for it in select * from jsonb_array_elements(p_items) loop
        v_prod := nullif(it->>'product_id','')::uuid;
        v_qty := coalesce((it->>'quantity')::numeric,1);
        v_price := coalesce((it->>'unit_price')::numeric,0);
        v_ldisc := coalesce((it->>'discount')::numeric,0);
        v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
        if v_qty <= 0 then continue; end if;
        v_line := round(v_qty*v_price - v_ldisc,2);
        insert into sales_order_items(sales_order_id,product_id,description,quantity,unit_price,discount,vat_rate,line_total)
        values (p_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_ldisc,v_rate,v_line);
        v_sub := v_sub + round(v_qty*v_price,2); v_disc := v_disc + v_ldisc; v_vat := v_vat + round(v_line*v_rate,2);
      end loop;
      update sales_orders set subtotal=v_sub, discount=v_disc, vat=v_vat, total=round(v_sub-v_disc+v_vat,2) where id=p_id;
    end if;

  elsif p_type = 'invoice' then
    select company_id, number, to_jsonb(i) into v_company, v_label, v_before from invoices i where id = p_id;
    if v_company is null then raise exception 'Invoice not found'; end if;
    if (v_before->>'status') = 'draft' then
      update invoices set
        invoice_date = coalesce(nullif(p_patch->>'invoice_date','')::date, invoice_date),
        due_date = coalesce(nullif(p_patch->>'due_date','')::date, due_date),
        notes = coalesce(p_patch->>'notes', notes)
      where id = p_id;
      if p_items is not null then
        if jsonb_array_length(p_items) = 0 then raise exception 'An invoice needs at least one line'; end if;
        delete from invoice_items where invoice_id = p_id;
        for it in select * from jsonb_array_elements(p_items) loop
          v_prod := nullif(it->>'product_id','')::uuid;
          v_qty := coalesce((it->>'quantity')::numeric,1);
          v_price := coalesce((it->>'unit_price')::numeric,0);
          v_ldisc := coalesce((it->>'discount')::numeric,0);
          v_rate := coalesce((it->>'vat_rate')::numeric,0.05);
          if v_qty <= 0 then continue; end if;
          v_line := round(v_qty*v_price - v_ldisc,2);
          insert into invoice_items(invoice_id,product_id,description,quantity,unit_price,discount,vat_rate,line_total)
          values (p_id,v_prod,coalesce(nullif(it->>'description',''),(select name from products where id=v_prod),'Line'),v_qty,v_price,v_ldisc,v_rate,v_line);
          v_sub := v_sub + round(v_qty*v_price,2); v_disc := v_disc + v_ldisc; v_vat := v_vat + round(v_line*v_rate,2);
        end loop;
        update invoices set subtotal=v_sub, discount=v_disc, vat=v_vat, total=round(v_sub-v_disc+v_vat,2),
               balance=round(v_sub-v_disc+v_vat,2) - amount_paid where id=p_id;
      end if;
    else
      update invoices set notes = coalesce(p_patch->>'notes', notes) where id = p_id;
    end if;

  elsif p_type = 'supplier_bill' then
    select company_id, number, to_jsonb(b) into v_company, v_label, v_before from supplier_bills b where id = p_id;
    if v_company is null then raise exception 'Supplier bill not found'; end if;
    update supplier_bills set
      supplier_ref = coalesce(p_patch->>'supplier_ref', supplier_ref),
      due_date = case when (v_before->>'status') = 'draft'
                      then coalesce(nullif(p_patch->>'due_date','')::date, due_date) else due_date end
    where id = p_id;

  elsif p_type = 'goods_receipt' then
    select company_id, number, to_jsonb(g) into v_company, v_label, v_before from goods_receipts g where id = p_id;
    if v_company is null then raise exception 'Goods receipt not found'; end if;
    update goods_receipts set receipt_date = coalesce(nullif(p_patch->>'receipt_date','')::date, receipt_date) where id = p_id;

  elsif p_type = 'delivery_note' then
    select company_id, number, to_jsonb(d) into v_company, v_label, v_before from delivery_notes d where id = p_id;
    if v_company is null then raise exception 'Delivery note not found'; end if;
    update delivery_notes set delivery_date = coalesce(nullif(p_patch->>'delivery_date','')::date, delivery_date) where id = p_id;

  elsif p_type = 'customer_payment' then
    select company_id, number, to_jsonb(c) into v_company, v_label, v_before from customer_payments c where id = p_id;
    if v_company is null then raise exception 'Receipt not found'; end if;
    update customer_payments set reference = coalesce(p_patch->>'reference', reference),
                                 method = coalesce(nullif(p_patch->>'method',''), method) where id = p_id;

  elsif p_type = 'supplier_payment' then
    select company_id, number, to_jsonb(s) into v_company, v_label, v_before from supplier_payments s where id = p_id;
    if v_company is null then raise exception 'Payment not found'; end if;
    update supplier_payments set reference = coalesce(p_patch->>'reference', reference),
                                 method = coalesce(nullif(p_patch->>'method',''), method) where id = p_id;
  else
    raise exception 'Unknown document type %', p_type;
  end if;

  insert into audit_logs(company_id,actor,action,entity_type,entity_id,entity_label,before,after,source)
  values (v_company,p_actor,'Document edited',p_type,p_id,v_label,v_before,
          jsonb_build_object('patch',p_patch,'lines_replaced',(p_items is not null)),'edit');
end $$;

revoke all on function public.import_bank_transactions(uuid,uuid,jsonb,text) from anon;
revoke all on function public.allocate_bank_transaction(uuid,text,uuid,text,text) from anon;
revoke all on function public.unmatch_bank_transaction(uuid,text) from anon;
revoke all on function public.reconcile_bank_account(uuid,text,numeric,text) from anon;
revoke all on function public.update_document(text,uuid,jsonb,jsonb,text) from anon;
