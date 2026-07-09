
-- 1) Revoke EXECUTE from PUBLIC/anon on SECURITY DEFINER chart_account functions
REVOKE EXECUTE ON FUNCTION public.chart_account_next_code(uuid, uuid, context_type) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chart_account_autofill_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.chart_account_move(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_account_next_code(uuid, uuid, context_type) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.chart_account_move(uuid, uuid) TO authenticated, service_role;
-- autofill_code is a trigger fn; only service_role needs it
GRANT EXECUTE ON FUNCTION public.chart_account_autofill_code() TO service_role;

-- 2) audit_logs: add explicit deny UPDATE/DELETE policies on parent (applies to partitions)
DROP POLICY IF EXISTS "Deny update on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.audit_logs;
CREATE POLICY "Deny update on audit logs" ON public.audit_logs
  FOR UPDATE TO public USING (false) WITH CHECK (false);
CREATE POLICY "Deny delete on audit logs" ON public.audit_logs
  FOR DELETE TO public USING (false);

-- 3) profiles: restrict policies to authenticated role
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Super admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
