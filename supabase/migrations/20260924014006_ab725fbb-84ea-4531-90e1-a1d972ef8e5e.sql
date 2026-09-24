-- Remoção definitiva do pipeline Pluggy V2 (nunca adotado pela interface).
-- Toda a operação real roda na V1: pluggy_connections / pluggy_accounts /
-- pluggy_staging_transactions. Nenhum dado financeiro oficial depende da V2:
-- as 17 transações conciliadas já constam em public.transactions.

DROP TRIGGER IF EXISTS trg_audit_pluggy_v2_raw_delete ON public.pluggy_v2_transactions_raw;

DROP TABLE IF EXISTS public.pluggy_v2_transactions_raw_archive;
DROP TABLE IF EXISTS public.pluggy_v2_transactions_raw;
DROP TABLE IF EXISTS public.pluggy_v2_sync_runs;
DROP TABLE IF EXISTS public.pluggy_v2_accounts;
DROP TABLE IF EXISTS public.pluggy_v2_connections;

DROP FUNCTION IF EXISTS public.audit_pluggy_v2_raw_delete();
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_claim(integer);
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_claim();
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_finalize_success(uuid);
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_finalize_failure(uuid, text);
DROP FUNCTION IF EXISTS public.pluggy_v2_webhook_health();

DROP TYPE IF EXISTS public.pluggy_v2_webhook_status;
DROP TYPE IF EXISTS public.pluggy_v2_sync_status;
DROP TYPE IF EXISTS public.pluggy_v2_connection_status;