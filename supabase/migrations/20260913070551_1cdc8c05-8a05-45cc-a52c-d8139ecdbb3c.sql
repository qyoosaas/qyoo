CREATE OR REPLACE FUNCTION public.post_journal(p_company uuid, p_date date, p_memo text, p_ref_type text, p_ref_id uuid, p_ref_label text, p_lines jsonb, p_source text DEFAULT 'system'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_num text;
  v_line jsonb;
  v_debit numeric := 0;
  v_credit numeric := 0;
begin
  select 'JE-'||lpad((coalesce(count(*),0) + 1)::text, 5, '0') into v_num
  from public.journal_entries where company_id = p_company;

  -- totals are computed up front so the entry is inserted complete; the
  -- immutability trigger then guards it from any later UPDATE.
  select coalesce(sum(round(coalesce((l->>'debit')::numeric,0),2)),0),
         coalesce(sum(round(coalesce((l->>'credit')::numeric,0),2)),0)
    into v_debit, v_credit
  from jsonb_array_elements(p_lines) l;

  if round(v_debit,2) <> round(v_credit,2) then
    raise exception 'Journal entry does not balance: debits % vs credits %', v_debit, v_credit;
  end if;

  insert into public.journal_entries (company_id, number, entry_date, memo, source, ref_type, ref_id, ref_label, total_debit, total_credit)
  values (p_company, v_num, p_date, p_memo, p_source, p_ref_type, p_ref_id, p_ref_label, v_debit, v_credit)
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
  end loop;

  return v_id;
end;
$function$;