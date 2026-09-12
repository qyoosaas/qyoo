CREATE OR REPLACE FUNCTION public.next_doc_number(p_company uuid, p_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    when 'exception' then select coalesce(max(substring(code from '\d+$')::int),1000) into v_max from exceptions where company_id=p_company; v_prefix:='EXC-';
    else raise exception 'Unknown doc kind %', p_kind;
  end case;
  return v_prefix || (v_max + 1)::text;
end $function$;

CREATE OR REPLACE FUNCTION public.run_automation(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare r record; v_created int:=0; v_marked int:=0; v_matched int:=0;
begin
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

  for r in select b.*, s.name as sname from supplier_bills b join suppliers s on s.id=b.supplier_id
           where b.company_id=p_company and b.balance>0 and b.status not in ('cancelled') and b.due_date between current_date and current_date+7
             and not exists (select 1 from exceptions x where x.entity_id=b.id and x.type='payment_due' and x.status in ('open','in_review','waiting')) loop
    insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
    values (p_company,next_doc_number(p_company,'exception'),'payment_due','Payment due — '||r.sname||' '||r.number,'medium','Payables scheduler','supplier_bill',r.id,r.number,r.balance,
      'AED '||r.balance||' falls due on '||to_char(r.due_date,'DD Mon')||'.','Approval threshold requires a human release for outgoing payments.','Approve payment run or defer with supplier agreement.',88,'["investigate","keep_outstanding","dismiss"]'::jsonb,'open',r.due_date);
    v_created := v_created+1;
  end loop;

  for r in select p.*, coalesce(sum(ib.quantity),0) as qty from products p left join inventory_balances ib on ib.product_id=p.id
           where p.company_id=p_company and p.reorder_level>0 group by p.id having coalesce(sum(ib.quantity),0) < p.reorder_level loop
    if not exists (select 1 from exceptions x where x.entity_id=r.id and x.type='low_stock' and x.status in ('open','in_review','waiting')) then
      insert into exceptions(company_id,code,type,title,priority,source,entity_type,entity_id,entity_label,amount,description,reason,recommendation,confidence,actions,status,due_date)
      values (p_company,next_doc_number(p_company,'exception'),'low_stock','Below reorder level — '||r.sku,'medium','Inventory','product',r.id,r.sku,round(r.reorder_level*r.cost,2),
        r.name||' has '||r.qty||' '||r.unit||' on hand vs reorder level '||r.reorder_level||'.','Stock below threshold.','Raise a purchase order for '||(r.reorder_level*2)||' '||r.unit||'.',85,'["investigate","dismiss"]'::jsonb,'open',current_date+5);
      v_created := v_created+1;
    end if;
  end loop;

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

  insert into audit_logs(company_id,actor,action,entity_type,entity_label,after,source)
  values (p_company,'FIN','Automation run completed','automation','Automation cycle',
    jsonb_build_object('created',v_created,'matched',v_matched,'marked_overdue',v_marked),'automation_engine');

  return jsonb_build_object('created',v_created,'matched',v_matched,'marked_overdue',v_marked);
end $function$;