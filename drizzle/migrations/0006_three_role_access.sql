UPDATE public.user_roles SET role = 'editor' WHERE role IN ('finance_manager','accountant');
ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'viewer';
COMMENT ON TYPE public.app_role IS 'Active roles: admin, editor, viewer. finance_manager/accountant are DEPRECATED (migrated to editor).';

CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS public.app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END LIMIT 1), 'viewer'::public.app_role)
$$;
CREATE OR REPLACE FUNCTION public.can_edit() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.current_app_role() IN ('admin','editor') $$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.current_app_role() = 'admin' $$;
REVOKE EXECUTE ON FUNCTION public.current_app_role(), public.can_edit(), public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role(), public.can_edit(), public.is_admin() TO authenticated, service_role;

DO $$
DECLARE t text; fn text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('user_roles','profiles') LOOP
    fn := CASE WHEN t IN ('settings','tax_rates','accounting_periods','companies') THEN 'public.is_admin()' ELSE 'public.can_edit()' END;
    EXECUTE format('DROP POLICY IF EXISTS role_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS role_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS role_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY role_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (%s)', t, fn);
    EXECUTE format('CREATE POLICY role_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', t, fn, fn);
    EXECUTE format('CREATE POLICY role_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (%s)', t, fn);
  END LOOP;
END $$;