DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs_2026_08','audit_logs_2026_09','audit_logs_2026_10','audit_logs_2026_11'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admins can view audit logs" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Super admins can view audit logs" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin((SELECT auth.uid())))$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny update on audit logs" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Deny update on audit logs" ON public.%I FOR UPDATE USING (false)$f$, t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Deny delete on audit logs" ON public.%I FOR DELETE USING (false)$f$, t);
  END LOOP;
END $$;