-- Drop functions first (some reference the tables)
DROP FUNCTION IF EXISTS public.ingest_of_transaction(jsonb) CASCADE;
DROP FUNCTION IF EXISTS public.auto_categorize_of_transaction() CASCADE;
DROP FUNCTION IF EXISTS public.reconcile_of_transactions(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.link_open_finance_account(uuid, uuid, uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.claim_pluggy_webhook_events(integer, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.claim_open_finance_sync(integer, timestamptz) CASCADE;
DROP FUNCTION IF EXISTS public.claim_open_finance_sync() CASCADE;

-- Drop Open Finance tables
DROP TABLE IF EXISTS public.open_finance_transactions_raw CASCADE;
DROP TABLE IF EXISTS public.open_finance_webhook_events CASCADE;
DROP TABLE IF EXISTS public.open_finance_sync_runs CASCADE;
DROP TABLE IF EXISTS public.open_finance_consents CASCADE;
DROP TABLE IF EXISTS public.open_finance_accounts CASCADE;
DROP TABLE IF EXISTS public.open_finance_connection_requests CASCADE;
DROP TABLE IF EXISTS public.open_finance_connections CASCADE;