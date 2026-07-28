
-- 1) Redefinir funções que referenciam open_finance_accounts, sem os checks OF
CREATE OR REPLACE FUNCTION public.delete_account(_account_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _context context_type;
  _caller uuid := auth.uid();
  _has_tx boolean;
BEGIN
  SELECT company_id, context INTO _company_id, _context
    FROM public.accounts WHERE id = _account_id;
  IF _context IS NULL THEN RAISE EXCEPTION 'account not found'; END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = _account_id AND user_id = _caller) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE account_id = _account_id
        OR destination_account_id = _account_id
        OR connection_account_id = _account_id
  ) INTO _has_tx;

  IF _has_tx THEN
    UPDATE public.accounts
       SET is_active = false, soft_deleted_at = now(), updated_at = now()
     WHERE id = _account_id;
    PERFORM public.insert_audit_log(
      _action := 'account_soft_deleted',
      _entity_type := 'account',
      _entity_id := _account_id::text,
      _details := jsonb_build_object('company_id', _company_id, 'context', _context, 'reason', 'has_transactions')
    );
    RETURN 'soft';
  END IF;

  DELETE FROM public.accounts WHERE id = _account_id;
  PERFORM public.insert_audit_log(
    _action := 'account_hard_deleted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'context', _context)
  );
  RETURN 'hard';
END $function$;

CREATE OR REPLACE FUNCTION public.soft_delete_account(_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _company_id uuid; _context context_type; _caller uuid := auth.uid();
BEGIN
  SELECT company_id, context INTO _company_id, _context
    FROM public.accounts WHERE id = _account_id;
  IF _context IS NULL THEN RAISE EXCEPTION 'account not found'; END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = _account_id AND user_id = _caller) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  UPDATE public.accounts
     SET is_active = false, soft_deleted_at = now(), updated_at = now()
   WHERE id = _account_id;

  PERFORM public.insert_audit_log(
    _action := 'account_soft_deleted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'context', _context, 'reason', 'manual')
  );
END $function$;

CREATE OR REPLACE FUNCTION public.prevent_hard_delete_account_with_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE account_id = OLD.id
        OR destination_account_id = OLD.id
        OR connection_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'conta possui lancamentos; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.credit_card_invoices ci
      LEFT JOIN public.transactions t ON t.id = ci.payment_transaction_id
      LEFT JOIN public.credit_cards  c ON c.id = ci.credit_card_id
     WHERE t.account_id = OLD.id
        OR c.default_payment_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'conta possui faturas de cartao vinculadas; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END $function$;

-- 2) Remover funções específicas do Pluggy/Open Finance
DROP FUNCTION IF EXISTS public.auto_promote_open_finance_raw() CASCADE;
DROP FUNCTION IF EXISTS public.claim_open_finance_sync(integer) CASCADE;
DROP FUNCTION IF EXISTS public.claim_open_finance_sync() CASCADE;
DROP FUNCTION IF EXISTS public.classify_open_finance_item_state(text, jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.classify_open_finance_item_state(text) CASCADE;
DROP FUNCTION IF EXISTS public.cleanup_open_finance_artifacts() CASCADE;
DROP FUNCTION IF EXISTS public.create_and_link_open_finance_account(uuid, uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.disconnect_open_finance_connection(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.enqueue_open_finance_scheduled_syncs() CASCADE;
DROP FUNCTION IF EXISTS public.get_company_pluggy_version(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ignore_open_finance_account(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.ignore_open_finance_raw(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.link_open_finance_account(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.open_finance_sync_health() CASCADE;
DROP FUNCTION IF EXISTS public.pair_retro_transfers(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_expire_stale_connect_requests() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_purge_expired_connect_tokens() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_remote_delete_claim(integer) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_remote_delete_claim() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_remote_delete_finalize_failure(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_remote_delete_finalize_success(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_remote_delete_health() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_claim_remote_deletion(integer) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_claim_remote_deletion() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_expire_stale_requests() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_finalize_remote_deletion(uuid, boolean, text) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_reconciliation() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_slo_snapshot() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_claim(integer) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_claim() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_finalize_failure(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_finalize_success(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_health() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_claim(integer) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_claim() CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_finalize_failure(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_finalize_success(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_webhook_health() CASCADE;
DROP FUNCTION IF EXISTS public.promote_open_finance_raw_ids(uuid[]) CASCADE;
DROP FUNCTION IF EXISTS public.promote_open_finance_transactions(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.reap_open_finance_stuck_runs() CASCADE;
DROP FUNCTION IF EXISTS public.release_open_finance_sync(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.release_open_finance_sync(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.set_company_pluggy_version(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.set_open_finance_auto_import(uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.unlink_open_finance_account(uuid) CASCADE;

-- 3) Drop tabelas Pluggy V2
DROP TABLE IF EXISTS public.pluggy_v2_transactions_raw CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_webhook_events CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_sync_runs CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_alerts CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_accounts CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_connect_requests CASCADE;
DROP TABLE IF EXISTS public.pluggy_v2_connections CASCADE;

-- 4) Drop tabelas Open Finance V1
DROP TABLE IF EXISTS public.open_finance_transactions_raw CASCADE;
DROP TABLE IF EXISTS public.open_finance_webhook_events CASCADE;
DROP TABLE IF EXISTS public.open_finance_sync_runs CASCADE;
DROP TABLE IF EXISTS public.open_finance_connection_requests CASCADE;
DROP TABLE IF EXISTS public.open_finance_accounts CASCADE;
DROP TABLE IF EXISTS public.open_finance_connections CASCADE;

-- 5) Remover coluna pluggy_version de companies
ALTER TABLE public.companies DROP COLUMN IF EXISTS pluggy_version;
