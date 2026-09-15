-- P0 — Security hardening (somente permissões; nenhum dado alterado).
--
-- 1. Remove EXECUTE de anon/PUBLIC de TODAS as funções SECURITY DEFINER em `public`
--    que ainda sejam executáveis por anon no momento da aplicação.
--    Funções de gatilho, seeds, purge e rotinas internas ficam apenas com
--    service_role; as app-facing permanecem para `authenticated` (a autorização
--    real continua dentro da função + RLS).
-- 2. Remove privilégios de tabela de `anon` nas tabelas financeiras e correlatas
--    (defesa em profundidade: RLS deixa de ser a única barreira, inclusive para
--    Realtime, que respeita RLS e grants).
--
-- Idempotente: pode ser reaplicada. Nenhum INSERT/UPDATE/DELETE em dados reais.

DO $$
DECLARE
  fn record;
  internal_only text[] := ARRAY[
    'companies_guard_owner_transfer','credit_cards_purge_open_finance','dp_apoio_unidades_guard',
    'dp_colaborador_validar_setor','dp_config_dia_validar_setor','dp_feriado_validar',
    'dp_folga_limite_setor_validar','dp_ocorrencia_tipos_seed_on_company','dp_ocorrencia_tipos_seed',
    'dp_setores_validar_unidade','dp_refresh_document_pending','pluggy_mark_duplicate_staging',
    'purge_open_finance_link'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname, p.prorettype = 'trigger'::regtype AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.sig);

    IF fn.is_trigger OR fn.proname = ANY (internal_only) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn.sig);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;

    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts','transactions','credit_cards','credit_card_invoices',
    'pluggy_connections','pluggy_accounts','pluggy_v2_connections','pluggy_v2_accounts',
    'pluggy_v2_sync_runs','pluggy_v2_transactions_raw','pluggy_v2_transactions_raw_archive',
    'invoices','subscriptions','subscription_cards','subscription_cycle_events',
    'transaction_attachments','transaction_tags','transaction_origin_changes',
    'pluggy_staging_transactions','balance_drift_snapshots'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;
