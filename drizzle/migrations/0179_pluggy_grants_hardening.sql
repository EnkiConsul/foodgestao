-- Fase 3 / Item 11: grants mínimos nas tabelas pluggy_* (idempotente).
REVOKE ALL ON public.pluggy_webhook_events FROM anon, authenticated;
GRANT ALL ON public.pluggy_webhook_events TO service_role;

REVOKE ALL ON public.pluggy_accounts, public.pluggy_connect_requests, public.pluggy_connections, public.pluggy_staging_transactions FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.pluggy_accounts, public.pluggy_connect_requests, public.pluggy_connections, public.pluggy_staging_transactions FROM authenticated;
GRANT SELECT ON public.pluggy_accounts, public.pluggy_connect_requests, public.pluggy_connections, public.pluggy_staging_transactions TO authenticated;
GRANT ALL ON public.pluggy_accounts, public.pluggy_connect_requests, public.pluggy_connections, public.pluggy_staging_transactions TO service_role;