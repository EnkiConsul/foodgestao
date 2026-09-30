DO $$ DECLARE r record; BEGIN
FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('dp_folga_ferias_no_mes','is_dp_colaborador') LOOP
 EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
END LOOP; END $$;