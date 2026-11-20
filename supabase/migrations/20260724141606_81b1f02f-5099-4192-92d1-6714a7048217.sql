
-- Políticas explícitas de deny para tabelas sensíveis (service_role bypassa RLS)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['auth_login_identifiers','auth_rate_limits','auth_recovery_challenges','cnpj_cache']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "deny_all_authenticated" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "deny_all_anon" ON public.%I', t);
    EXECUTE format('CREATE POLICY "deny_all_authenticated" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "deny_all_anon" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- The legacy email queue helpers were provisioned outside the migration history.
-- Preserve their hardening in databases where they exist.
DO $$
DECLARE
  signature text;
  helper regprocedure;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.enqueue_email(text, jsonb)',
    'public.read_email_batch(text, integer, integer)',
    'public.move_to_dlq(text, text, bigint, jsonb)',
    'public.delete_email(text, bigint)'
  ]
  LOOP
    helper := to_regprocedure(signature);
    IF helper IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pgmq, extensions', helper);
    END IF;
  END LOOP;
END $$;
