-- P0 Open Finance: nenhuma entrada (leitura ou mutação) para usuário bloqueado.
-- Policy RESTRICTIVE apenas para authenticated; service_role não é afetado.
-- Rollback: DROP POLICY dos itens criados abaixo.

CREATE POLICY pluggy_accounts_not_blocked ON public.pluggy_accounts
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pluggy_connections_not_blocked ON public.pluggy_connections
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pluggy_connect_requests_not_blocked ON public.pluggy_connect_requests
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pluggy_staging_not_blocked ON public.pluggy_staging_transactions
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pv2_acc_not_blocked ON public.pluggy_v2_accounts
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pv2_conn_not_blocked ON public.pluggy_v2_connections
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());

CREATE POLICY pv2_raw_not_blocked ON public.pluggy_v2_transactions_raw
AS RESTRICTIVE FOR ALL TO authenticated USING (public.auth_access_enabled()) WITH CHECK (public.auth_access_enabled());