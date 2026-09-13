CREATE OR REPLACE FUNCTION public.automation_selftest()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public' AS $$
declare v_company uuid; k text; out jsonb := '{}'::jsonb;
begin
  select id into v_company from companies order by created_at limit 1;
  if v_company is null then return jsonb_build_object('ok',false,'error','no company'); end if;
  foreach k in array array['invoice','sales_order','customer_payment','purchase_order','goods_receipt','supplier_bill','supplier_payment','expense','exception'] loop
    out := out || jsonb_build_object(k, next_doc_number(v_company, k));
  end loop;
  return jsonb_build_object('ok', true, 'company', v_company, 'numbers', out);
end $$;
REVOKE EXECUTE ON FUNCTION public.automation_selftest() FROM anon;
GRANT EXECUTE ON FUNCTION public.automation_selftest() TO authenticated, service_role;