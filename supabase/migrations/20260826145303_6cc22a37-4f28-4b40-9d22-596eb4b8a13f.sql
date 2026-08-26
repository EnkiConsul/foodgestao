-- 1) Rotinas agendadas do módulo
DO $$
DECLARE r record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR r IN
      SELECT jobname FROM cron.job
      WHERE command ILIKE '%orders%' OR command ILIKE '%ped_%' OR command ILIKE '%storefront%'
    LOOP
      PERFORM cron.unschedule(r.jobname);
    END LOOP;
  END IF;
END $$;

-- 2) Políticas de storage do módulo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%ped-produtos%' OR qual ILIKE '%ped-storefront%'
           OR with_check ILIKE '%ped-produtos%' OR with_check ILIKE '%ped-storefront%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
  END LOOP;
END $$;

-- 3) Tabelas do módulo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'ped\_%'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
END $$;

-- 4) Funções do módulo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'ped\_%'
        OR p.proname LIKE 'storefront\_%'
        OR p.proname IN (
          'activate_orders_unit', 'can_use_orders_module', 'contract_orders_module',
          'expire_orders_trials', 'orders_block_company', 'orders_enforce_expiration',
          'orders_module_usable', 'orders_trial_snapshot', 'set_orders_retention_days',
          'start_orders_trial'
        )
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

-- 5) Tipos exclusivos do módulo
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.typname FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typtype = 'e' AND t.typname LIKE 'ped\_%'
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;

-- 6) Catálogo e habilitações
DELETE FROM public.modulos_catalogo WHERE slug = 'pedidos';
DELETE FROM public.company_modules WHERE module = 'pedidos';
DELETE FROM public.module_dependencies WHERE module = 'pedidos' OR requires = 'pedidos';