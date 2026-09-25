CREATE OR REPLACE FUNCTION public.approve_document(p_upload uuid, p_payload jsonb, p_actor text DEFAULT 'Ahmed Rahman')
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
declare
  u document_uploads%rowtype;
  k text := p_payload->>'kind';
  v_id uuid; v_label text; v_type text; v_res jsonb; v_je uuid;
  v_sub numeric := coalesce((p_payload->>'subtotal')::numeric, 0);
  v_vat numeric := coalesce((p_payload->>'vat')::numeric, 0);
  v_tot numeric := coalesce((p_payload->>'total')::numeric, 0);
  v_date date := coalesce(nullif(p_payload->>'date','')::date, current_date);
  v_ref text := nullif(p_payload->>'reference','');
  v_name text; v_apply numeric; v_bill supplier_bills%rowtype; v_inv invoices%rowtype;
begin
  select * into u from document_uploads where id = p_upload for update;
  if u.id is null then raise exception 'Document not found'; end if;
  if u.status = 'posted' then raise exception 'This document has already been approved and posted'; end if;

  case k
    when 'supplier_bill' then
      v_id := create_supplier_bill(u.company_id, (p_payload->>'supplier_id')::uuid, v_date,
        nullif(p_payload->>'due_date','')::date, p_payload->'items', v_ref,
        nullif(p_payload->>'purchase_order_id','')::uuid, nullif(p_payload->>'goods_receipt_id','')::uuid);
      select number into v_label from supplier_bills where id = v_id; v_type := 'supplier_bill';
    when 'invoice' then
      v_id := create_invoice(u.company_id, (p_payload->>'customer_id')::uuid, v_date,
        nullif(p_payload->>'due_date','')::date, p_payload->'items', 'Imported from '||u.file_name, true);
      select number into v_label from invoices where id = v_id; v_type := 'invoice';
    when 'purchase_order' then
      v_id := create_purchase_order(u.company_id, (p_payload->>'supplier_id')::uuid, v_date,
        nullif(p_payload->>'expected_date','')::date, p_payload->'items');
      select number into v_label from purchase_orders where id = v_id; v_type := 'purchase_order';
    when 'sales_order' then
      v_id := create_sales_order(u.company_id, (p_payload->>'customer_id')::uuid, v_date,
        nullif(p_payload->>'expected_date','')::date, p_payload->'items');
      select number into v_label from sales_orders where id = v_id; v_type := 'sales_order';
    when 'expense' then
      v_id := create_expense(u.company_id, p_payload->>'merchant', v_date, v_tot, null,
        nullif(p_payload->>'employee',''), coalesce(nullif(p_payload->>'method',''),'company_card'), true, null, null);
      select number into v_label from expenses where id = v_id; v_type := 'expense';
    when 'goods_receipt' then
      v_id := receive_goods((p_payload->>'purchase_order_id')::uuid, p_payload->'lines', v_date, p_actor);
      select number into v_label from goods_receipts where id = v_id; v_type := 'goods_receipt';
    when 'delivery_note' then
      v_id := deliver_goods((p_payload->>'sales_order_id')::uuid, p_payload->'lines', v_date, p_actor);
      select number into v_label from delivery_notes where id = v_id; v_type := 'delivery_note';
    when 'bank_statement' then
      v_res := import_bank_transactions(u.company_id, (p_payload->>'bank_account_id')::uuid, p_payload->'rows', u.file_name);
      v_id := (p_payload->>'bank_account_id')::uuid;
      select name into v_label from bank_accounts where id = v_id; v_type := 'bank_statement';
    when 'supplier_credit' then
      select name into v_name from suppliers where id = (p_payload->>'supplier_id')::uuid;
      if v_name is null then raise exception 'Link a supplier before posting this credit note'; end if;
      if v_tot <= 0 then raise exception 'The credit note total must be greater than zero'; end if;
      v_je := post_journal(u.company_id, v_date, 'Supplier credit note '||coalesce(v_ref,'')||' — '||v_name,
        'supplier_credit', p_upload, coalesce(v_ref,'Credit note'), jsonb_build_array(
          jsonb_build_object('code','2000','desc',v_name,'debit',v_tot,'credit',0),
          jsonb_build_object('code','1210','desc','Purchase credit','debit',0,'credit',v_tot - v_vat),
          jsonb_build_object('code','1400','desc','VAT input reversed','debit',0,'credit',v_vat)), 'document');
      if nullif(p_payload->>'bill_id','') is not null then
        select * into v_bill from supplier_bills where id = (p_payload->>'bill_id')::uuid for update;
        v_apply := least(v_tot, greatest(v_bill.balance,0));
        if v_apply > 0 then
          update supplier_bills set amount_paid = amount_paid + v_apply, balance = balance - v_apply,
            status = case when balance - v_apply <= 0.005 then 'paid'::doc_status else 'partially_paid'::doc_status end
          where id = v_bill.id;
        end if;
      end if;
      v_id := v_je; v_label := coalesce(v_ref,'Supplier credit'); v_type := 'journal_entry';
    when 'customer_credit' then
      select name into v_name from customers where id = (p_payload->>'customer_id')::uuid;
      if v_name is null then raise exception 'Link a customer before posting this credit note'; end if;
      if v_tot <= 0 then raise exception 'The credit note total must be greater than zero'; end if;
      v_je := post_journal(u.company_id, v_date, 'Customer credit note '||coalesce(v_ref,'')||' — '||v_name,
        'customer_credit', p_upload, coalesce(v_ref,'Credit note'), jsonb_build_array(
          jsonb_build_object('code','4000','desc','Sales credit','debit',v_tot - v_vat,'credit',0),
          jsonb_build_object('code','2100','desc','VAT output reversed','debit',v_vat,'credit',0),
          jsonb_build_object('code','1100','desc',v_name,'debit',0,'credit',v_tot)), 'document');
      if nullif(p_payload->>'invoice_id','') is not null then
        select * into v_inv from invoices where id = (p_payload->>'invoice_id')::uuid for update;
        v_apply := least(v_tot, greatest(v_inv.balance,0));
        if v_apply > 0 then
          update invoices set amount_paid = amount_paid + v_apply, balance = balance - v_apply,
            status = case when balance - v_apply <= 0.005 then 'paid'::doc_status else 'partially_paid'::doc_status end
          where id = v_inv.id;
        end if;
      end if;
      v_id := v_je; v_label := coalesce(v_ref,'Customer credit'); v_type := 'journal_entry';
    else
      raise exception 'No automatic workflow exists for this document type yet';
  end case;

  update document_uploads set status = 'posted', final_posted_data = p_payload->'draft',
    linked_entity_type = v_type, linked_entity_id = case when v_type = 'bank_statement' then null else v_id end,
    linked_entity_label = v_label, approved_at = now()
  where id = p_upload;

  insert into document_upload_events (document_upload_id, stage, detail, payload, actor)
  values (p_upload, 'posted', 'Approved and converted into '||replace(v_type,'_',' ')||' '||coalesce(v_label,''), v_res, p_actor);

  if u.exception_id is not null then
    update exceptions set status = 'resolved', resolved_at = now(),
      resolution = 'Document approved and posted as '||coalesce(v_label,v_type)
    where id = u.exception_id and status not in ('resolved','dismissed');
    insert into exception_actions (exception_id, action, performed_by, notes, journal_entry_id)
    values (u.exception_id, 'approved', p_actor, 'Resolved by approving the document', v_je);
  end if;

  insert into audit_logs (company_id, actor, action, entity_type, entity_id, entity_label, after, source)
  values (u.company_id, p_actor, 'Document approved', 'document_upload', p_upload, u.file_name,
    jsonb_build_object('created', v_type, 'id', v_id, 'label', v_label, 'import', v_res), 'documents');

  return jsonb_build_object('type', v_type, 'id', v_id, 'label', v_label, 'import', v_res);
end $$;

REVOKE EXECUTE ON FUNCTION public.approve_document(uuid, jsonb, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_document(uuid, jsonb, text) TO authenticated, service_role;