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
      EXECUTE format('ALTER FUNCTION %s SET search_path = public, pgmq', helper);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', helper);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', helper);
    END IF;
  END LOOP;
END $$;
