DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_policies
    WHERE schemaname='public'
      AND policyname='Users can insert own audit logs'
      AND cmd='INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Users can insert own audit logs', t);
  END LOOP;
END $$;

-- Explicit deny INSERT for authenticated/anon on parent (partitions inherit)
CREATE POLICY "Deny insert on audit logs"
ON public.audit_logs
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

REVOKE INSERT ON public.audit_logs FROM authenticated, anon;