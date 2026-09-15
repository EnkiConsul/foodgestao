-- P0.3 — Rotinas de QA/E2E fora do schema exposto (`public` -> `qa`)
--
-- Idempotente. Não altera dados reais: apenas schema, funções e permissões.
--
-- Objetivo: nenhuma rotina `_e2e_*`, `_test_*` ou guarda de QA
-- (`_assert_test_helper_allowed`) permanece em `public`, portanto elas deixam
-- de existir como RPC do PostgREST (que expõe apenas `public`/`graphql_public`).
-- Execução passa a ser exclusivamente server-side: conexão direta ao banco
-- (migrations/CI com SUPABASE_DB_URL) ou papel de serviço via SQL.
--
-- Ver docs/security/p0-3-qa-functions-private-schema.md

-- 1) Schema não exposto, fechado por padrão -------------------------------
CREATE SCHEMA IF NOT EXISTS qa;
COMMENT ON SCHEMA qa IS
  'P0.3: rotinas de QA/E2E (_e2e_*/_test_*). Fora do PostgREST. Somente service_role/conexão direta.';

REVOKE ALL ON SCHEMA qa FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA qa FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA qa FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA qa TO service_role';
  END IF;
END
$$;

-- 2) Mover as rotinas de QA de public para qa -----------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE E'\\_e2e\\_%'
           OR p.proname LIKE E'\\_test\\_%'
           OR p.proname = '_assert_test_helper_allowed')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET SCHEMA qa', r.sig);
  END LOOP;
END
$$;

-- 3) Corrigir referências internas public._assert_... -> qa._assert_... ----
DO $$
DECLARE r record; novo text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'qa'
      AND p.prosrc LIKE '%public._assert_test_helper_allowed%'
  LOOP
    novo := replace(pg_get_functiondef(r.oid),
                    'public._assert_test_helper_allowed',
                    'qa._assert_test_helper_allowed');
    EXECUTE novo;
  END LOOP;
END
$$;

-- 4) Permissões: só o papel de serviço executa ----------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'qa'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
  END LOOP;
END
$$;

-- 5) Verificação fail-closed ---------------------------------------------
DO $$
DECLARE sobrou int;
BEGIN
  SELECT count(*) INTO sobrou
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (p.proname LIKE E'\\_e2e\\_%'
         OR p.proname LIKE E'\\_test\\_%'
         OR p.proname = '_assert_test_helper_allowed');
  IF sobrou > 0 THEN
    RAISE EXCEPTION 'P0.3: ainda existem % rotinas de QA em public', sobrou;
  END IF;
END
$$;
