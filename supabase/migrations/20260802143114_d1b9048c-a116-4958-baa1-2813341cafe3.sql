DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs_2026_08','audit_logs_2026_09','audit_logs_2026_10','audit_logs_2026_11']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny update on audit logs" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny insert on audit logs" ON public.%I', t);

    EXECUTE format('CREATE POLICY "Deny insert on audit logs" ON public.%I AS RESTRICTIVE FOR INSERT TO public WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "Deny update on audit logs" ON public.%I AS RESTRICTIVE FOR UPDATE TO public USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "Deny delete on audit logs" ON public.%I AS RESTRICTIVE FOR DELETE TO public USING (false)', t);
  END LOOP;
END $$;