
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

-- Fix mutable search_path
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, extensions;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, extensions;
