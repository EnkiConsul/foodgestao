DO $$
DECLARE
  r record;
  pol_txt text;
BEGIN
  SELECT coalesce(string_agg(coalesce(pg_get_expr(polqual, polrelid), '') || ' ' || coalesce(pg_get_expr(polwithcheck, polrelid), ''), ' '), '')
    INTO pol_txt
  FROM pg_policy;

  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- Preserva funções referenciadas por policies (anon precisa de EXECUTE nelas)
    IF position(r.proname IN pol_txt) > 0 THEN
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
  END LOOP;
END $$;