DROP POLICY IF EXISTS "Deny delete on audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Deny update on audit logs" ON public.audit_logs;

CREATE POLICY "Deny delete on audit logs"
ON public.audit_logs
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);

CREATE POLICY "Deny update on audit logs"
ON public.audit_logs
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);