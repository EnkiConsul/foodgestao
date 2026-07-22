
DROP FUNCTION IF EXISTS public.pluggy_link_provider_account(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.pluggy_upsert_transaction CASCADE;
DROP FUNCTION IF EXISTS public.can_sync_bank_connection(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.can_manage_bank_connection(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.list_active_bank_connections() CASCADE;
DROP TABLE IF EXISTS public.bank_connection_accounts CASCADE;
DROP TABLE IF EXISTS public.bank_connections CASCADE;
DROP TABLE IF EXISTS public.pluggy_webhook_events CASCADE;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS provider_transaction_id;
