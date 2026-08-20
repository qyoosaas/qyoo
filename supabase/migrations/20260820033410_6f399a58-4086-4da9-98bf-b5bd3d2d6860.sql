revoke execute on function public.has_role(uuid, public.app_role) from public;

create or replace function public.post_journal(
  p_company uuid, p_date date, p_memo text, p_ref_type text, p_ref_id uuid,
  p_ref_label text, p_lines jsonb, p_source text default 'system'
) returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id uuid;
  v_num text;
  v_line jsonb;
  v_debit numeric := 0;
  v_credit numeric := 0;
begin
  select 'JE-'||lpad((coalesce(count(*),0) + 1)::text, 5, '0') into v_num
  from public.journal_entries where company_id = p_company;

  insert into public.journal_entries (company_id, number, entry_date, memo, source, ref_type, ref_id, ref_label)
  values (p_company, v_num, p_date, p_memo, p_source, p_ref_type, p_ref_id, p_ref_label)
  returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into public.journal_entry_lines (journal_entry_id, account_code, account_name, description, debit, credit)
    values (
      v_id,
      v_line->>'code',
      coalesce((select name from public.accounts where company_id = p_company and code = v_line->>'code'), v_line->>'code'),
      coalesce(v_line->>'desc', p_memo),
      round(coalesce((v_line->>'debit')::numeric, 0), 2),
      round(coalesce((v_line->>'credit')::numeric, 0), 2)
    );
    v_debit := v_debit + round(coalesce((v_line->>'debit')::numeric, 0), 2);
    v_credit := v_credit + round(coalesce((v_line->>'credit')::numeric, 0), 2);
  end loop;

  update public.journal_entries set total_debit = v_debit, total_credit = v_credit where id = v_id;
  return v_id;
end;
$fn$;

create or replace function public.post_invoice(p_invoice uuid)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare inv public.invoices%rowtype; cust text; lines jsonb; je uuid;
begin
  select * into inv from public.invoices where id = p_invoice;
  select name into cust from public.customers where id = inv.customer_id;

  lines := jsonb_build_array(
    jsonb_build_object('code','1100','desc', cust||' — '||inv.number, 'debit', inv.total, 'credit', 0),
    jsonb_build_object('code','4000','desc','Sales revenue', 'debit', 0, 'credit', inv.subtotal),
    jsonb_build_object('code','2100','desc','VAT output 5%', 'debit', 0, 'credit', inv.vat)
  );
  if inv.discount > 0 then
    lines := lines || jsonb_build_array(jsonb_build_object('code','4050','desc','Sales discount','debit', inv.discount,'credit',0));
  end if;
  if inv.cogs > 0 then
    lines := lines || jsonb_build_array(
      jsonb_build_object('code','5000','desc','Cost of goods sold','debit', inv.cogs,'credit',0),
      jsonb_build_object('code','1230','desc','Finished goods relieved','debit',0,'credit', inv.cogs));
  end if;

  je := public.post_journal(inv.company_id, inv.invoice_date, 'Sales invoice '||inv.number||' — '||cust,
        'invoice', inv.id, inv.number, lines);

  insert into public.audit_logs (company_id, actor, action, entity_type, entity_id, entity_label, after, source)
  values (inv.company_id, 'System', 'Invoice posted', 'invoice', inv.id, inv.number,
          jsonb_build_object('total', inv.total, 'vat', inv.vat, 'customer', cust), 'accounting_engine');

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (inv.company_id, 'invoice_created', 'Invoice '||inv.number||' issued to '||cust,
          'AR, revenue, VAT and cash forecast updated automatically', inv.total, 'System', 'invoice', inv.id);
  return je;
end;
$fn$;

create or replace function public.post_customer_payment(p_payment uuid)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare pay public.customer_payments%rowtype; cust text; je uuid; inv public.invoices%rowtype;
begin
  select * into pay from public.customer_payments where id = p_payment;
  select name into cust from public.customers where id = pay.customer_id;

  je := public.post_journal(pay.company_id, pay.payment_date, 'Customer receipt '||pay.number||' — '||cust,
    'customer_payment', pay.id, pay.number,
    jsonb_build_array(
      jsonb_build_object('code','1000','desc','Bank receipt','debit', pay.amount,'credit',0),
      jsonb_build_object('code','1100','desc', cust||' settlement','debit',0,'credit', pay.amount)));

  if pay.invoice_id is not null then
    update public.invoices
      set amount_paid = amount_paid + pay.amount,
          balance = round(total - (amount_paid + pay.amount), 2),
          status = case when round(total - (amount_paid + pay.amount), 2) <= 0 then 'paid'::public.doc_status
                        else 'partially_paid'::public.doc_status end
      where id = pay.invoice_id returning * into inv;
  end if;

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (pay.company_id, 'payment_received', 'Payment received from '||cust,
          coalesce('Applied to '||inv.number, 'Unapplied receipt'), pay.amount, 'System', 'customer_payment', pay.id);
  return je;
end;
$fn$;

create or replace function public.post_supplier_bill(p_bill uuid)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare b public.supplier_bills%rowtype; sup text; je uuid;
begin
  select * into b from public.supplier_bills where id = p_bill;
  select name into sup from public.suppliers where id = b.supplier_id;
  je := public.post_journal(b.company_id, b.bill_date, 'Supplier bill '||b.number||' — '||sup,
    'supplier_bill', b.id, b.number,
    jsonb_build_array(
      jsonb_build_object('code','1210','desc','Raw material received','debit', b.subtotal,'credit',0),
      jsonb_build_object('code','1400','desc','VAT input 5%','debit', b.vat,'credit',0),
      jsonb_build_object('code','2000','desc', sup,'debit',0,'credit', b.total)));

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (b.company_id, 'bill_approved', 'Supplier bill '||b.number||' approved', sup||' — three-way matched', b.total, 'System', 'supplier_bill', b.id);
  return je;
end;
$fn$;

create or replace function public.post_supplier_payment(p_payment uuid)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare p public.supplier_payments%rowtype; sup text; je uuid;
begin
  select * into p from public.supplier_payments where id = p_payment;
  select name into sup from public.suppliers where id = p.supplier_id;
  je := public.post_journal(p.company_id, p.payment_date, 'Supplier payment '||p.number||' — '||sup,
    'supplier_payment', p.id, p.number,
    jsonb_build_array(
      jsonb_build_object('code','2000','desc', sup,'debit', p.amount,'credit',0),
      jsonb_build_object('code','1000','desc','Bank payment','debit',0,'credit', p.amount)));
  if p.supplier_bill_id is not null then
    update public.supplier_bills
      set amount_paid = amount_paid + p.amount,
          balance = round(total - (amount_paid + p.amount),2),
          status = case when round(total - (amount_paid + p.amount),2) <= 0 then 'paid'::public.doc_status else 'partially_paid'::public.doc_status end
      where id = p.supplier_bill_id;
  end if;
  return je;
end;
$fn$;

create or replace function public.post_expense(p_expense uuid)
returns uuid language plpgsql security invoker set search_path = public as $fn$
declare e public.expenses%rowtype; acct text; je uuid;
begin
  select * into e from public.expenses where id = p_expense;
  select coalesce(account_code,'6500') into acct from public.expense_categories where id = e.category_id;
  je := public.post_journal(e.company_id, e.expense_date, 'Expense '||e.number||' — '||e.merchant,
    'expense', e.id, e.number,
    jsonb_build_array(
      jsonb_build_object('code', coalesce(acct,'6500'),'desc', e.merchant,'debit', e.amount,'credit',0),
      jsonb_build_object('code','1400','desc','VAT input 5%','debit', e.vat,'credit',0),
      jsonb_build_object('code','1000','desc','Paid from bank','debit',0,'credit', e.amount + e.vat)));
  return je;
end;
$fn$;

create or replace function public.resolve_exception(p_exception uuid, p_action text, p_actor text default 'Ahmed Rahman')
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare
  ex public.exceptions%rowtype;
  inv public.invoices%rowtype;
  je uuid;
  v_amount numeric;
  v_msg text;
begin
  select * into ex from public.exceptions where id = p_exception;
  if ex.id is null then raise exception 'Exception not found'; end if;
  v_amount := coalesce(ex.amount, 0);

  if ex.entity_type = 'invoice' and ex.entity_id is not null then
    select * into inv from public.invoices where id = ex.entity_id;
  end if;

  if p_action = 'record_discount' then
    je := public.post_journal(ex.company_id, current_date, 'Customer discount on '||coalesce(ex.entity_label,'transaction'),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','4050','desc','Sales discount granted','debit', v_amount,'credit',0),
        jsonb_build_object('code','1100','desc','Accounts receivable cleared','debit',0,'credit', v_amount)));
    v_msg := 'Customer discount recorded — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'write_off' then
    je := public.post_journal(ex.company_id, current_date, 'Write-off on '||coalesce(ex.entity_label,'transaction'),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','6500','desc','Bad debt / write-off','debit', v_amount,'credit',0),
        jsonb_build_object('code','1100','desc','Accounts receivable cleared','debit',0,'credit', v_amount)));
    v_msg := 'Written off — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'credit_note' then
    je := public.post_journal(ex.company_id, current_date, 'Credit note against '||coalesce(ex.entity_label,'transaction'),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','4000','desc','Revenue reversed','debit', round(v_amount/1.05,2),'credit',0),
        jsonb_build_object('code','2100','desc','VAT output reversed','debit', round(v_amount - v_amount/1.05,2),'credit',0),
        jsonb_build_object('code','1100','desc','Accounts receivable cleared','debit',0,'credit', v_amount)));
    v_msg := 'Credit note issued — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'supplier_credit' then
    je := public.post_journal(ex.company_id, current_date, 'Recoverable supplier balance on '||coalesce(ex.entity_label,'transaction'),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','1300','desc','Supplier credit receivable','debit', v_amount,'credit',0),
        jsonb_build_object('code','2000','desc','Accounts payable adjusted','debit',0,'credit', v_amount)));
    v_msg := 'Supplier credit recognised — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'adjust_inventory' then
    je := public.post_journal(ex.company_id, current_date, 'Inventory variance adjustment — '||coalesce(ex.entity_label,''),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','5100','desc','Inventory variance charged to cost','debit', v_amount,'credit',0),
        jsonb_build_object('code','1230','desc','Inventory written down','debit',0,'credit', v_amount)));
    v_msg := 'Inventory adjusted — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'accept_variance' then
    je := public.post_journal(ex.company_id, current_date, 'Production variance absorbed — '||coalesce(ex.entity_label,''),
      'exception', ex.id, coalesce(ex.entity_label, ex.code),
      jsonb_build_array(
        jsonb_build_object('code','5200','desc','Production cost variance','debit', v_amount,'credit',0),
        jsonb_build_object('code','1220','desc','Work in progress relieved','debit',0,'credit', v_amount)));
    v_msg := 'Variance absorbed into production cost — AED '||to_char(v_amount,'FM999G999G990D00');
  elsif p_action = 'keep_outstanding' then
    v_msg := 'Kept outstanding — balance remains in receivables';
  elsif p_action = 'investigate' then
    update public.exceptions set status = 'in_review', assigned_to = p_actor where id = ex.id;
    insert into public.exception_actions (exception_id, action, performed_by, notes)
    values (ex.id, 'investigate', p_actor, 'Moved to investigation');
    return jsonb_build_object('status','in_review','message','Moved to review — assigned to '||p_actor);
  elsif p_action = 'dismiss' then
    update public.exceptions set status = 'dismissed', resolved_at = now(), resolution = 'Dismissed' where id = ex.id;
    insert into public.exception_actions (exception_id, action, performed_by) values (ex.id, 'dismiss', p_actor);
    return jsonb_build_object('status','dismissed','message','Dismissed');
  else
    v_msg := 'Resolved';
  end if;

  update public.exceptions
    set status = 'resolved', resolved_at = now(), resolution = v_msg, assigned_to = p_actor
    where id = ex.id;

  insert into public.exception_actions (exception_id, action, performed_by, notes, journal_entry_id)
  values (ex.id, p_action, p_actor, v_msg, je);

  if inv.id is not null and p_action in ('record_discount','write_off','credit_note') then
    update public.invoices set balance = 0, amount_paid = total, status = 'paid' where id = inv.id;
  end if;

  insert into public.audit_logs (company_id, actor, action, entity_type, entity_id, entity_label, before, after, source)
  values (ex.company_id, p_actor, 'Resolved exception: '||ex.title, coalesce(ex.entity_type,'exception'),
          coalesce(ex.entity_id, ex.id), coalesce(ex.entity_label, ex.code),
          jsonb_build_object('status', ex.status), jsonb_build_object('status','resolved','resolution', v_msg), 'exception_engine');

  insert into public.activity_feed (company_id, kind, title, detail, amount, actor, entity_type, entity_id)
  values (ex.company_id, 'exception_resolved', 'Exception resolved — '||ex.title, v_msg, v_amount, p_actor, 'exception', ex.id);

  return jsonb_build_object('status','resolved','message', v_msg, 'journal_entry_id', je);
end;
$fn$;