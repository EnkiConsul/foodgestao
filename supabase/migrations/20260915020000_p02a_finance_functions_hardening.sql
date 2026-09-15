-- P0.2-A: hardening das funções SECURITY DEFINER do domínio financeiro/Open Finance.
-- Idempotente. Não altera dados (nenhum INSERT/UPDATE/DELETE).
-- Estratégia: helpers internos e funções de trigger deixam de ser executáveis por
-- authenticated (e anon/PUBLIC); apenas service_role mantém EXECUTE.
-- RPCs app-facing (usadas por src/ ou Edge Functions com JWT) permanecem inalteradas.

DO $$
DECLARE
  r record;
  internal_names text[] := ARRAY[
    -- helpers internos (chamados somente por outras funções SECURITY DEFINER)
    'assign_transaction_to_invoice',
    'chart_account_next_code',
    'chart_accounts_seed_default',
    'recalc_credit_card_invoice_totals',
    'recompute_account_balance',
    'soft_delete_account',
    'report_balance_drift',
    'sync_of_account_balance',
    -- Open Finance legado: sem qualquer chamada em src/ ou supabase/functions/
    'create_and_link_open_finance_account',
    'link_open_finance_account',
    'ignore_open_finance_account',
    'ignore_open_finance_raw',
    'promote_open_finance_transactions',
    'open_finance_sync_health',
    -- funções de trigger financeiras (nunca chamadas como RPC)
    'audit_pluggy_v2_raw_delete',
    'chart_account_autofill_code',
    'guard_of_current_balance',
    'guard_transaction_category_active',
    'learn_categorization_rule',
    'pluggy_sync_pause_on_account_toggle',
    'prevent_hard_delete_account_with_history',
    'seed_default_account_on_company',
    'tg_transactions_assign_cc_invoice'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname = ANY (internal_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
