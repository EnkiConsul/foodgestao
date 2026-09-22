-- =====================================================================
-- Fase 8 — Menor privilégio: visitante (anon) sem poder de gravação.
--
-- ROLLBACK (se precisar restaurar exatamente o estado anterior):
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--              WHERE n.nspname='public' AND c.relkind='r' LOOP
--       EXECUTE format('GRANT INSERT, UPDATE, DELETE ON public.%I TO anon', r.relname);
--     END LOOP; END $$;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
--   -- e os GRANT EXECUTE listados no fim deste arquivo.
-- =====================================================================

-- 1) Tabelas: visitante perde escrita em todo o schema public (leitura intacta).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;

-- 2) Novas tabelas não nascem mais com escrita para visitante.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon;

DO $$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon';
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'privilegios padrao de postgres nao ajustados (sem permissao)';
END $$;

-- 3) Rotinas internas e gatilhos fora do alcance do visitante.
--    a) gatilhos: nenhum papel de cliente executa diretamente.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

--    b) esquema reservado: só serviços internos e usuário logado (via rotinas oficiais).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.prorettype <> 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

--    c) rotinas de Pessoas e do painel: exigem sessão, portanto sem visitante.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND (p.proname LIKE 'dp\_%' OR p.proname LIKE 'fn\_mfa\_%' OR p.proname = 'pluggy_clear_pending_staging')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;
