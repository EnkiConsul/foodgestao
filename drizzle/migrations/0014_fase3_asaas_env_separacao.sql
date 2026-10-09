ALTER TABLE public.billing_accounts ADD COLUMN IF NOT EXISTS asaas_env text NOT NULL DEFAULT 'production';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS asaas_env text NOT NULL DEFAULT 'production';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS asaas_env text NOT NULL DEFAULT 'production';
ALTER TABLE public.asaas_webhook_events ADD COLUMN IF NOT EXISTS asaas_env text NOT NULL DEFAULT 'production';
ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_asaas_env_chk CHECK (asaas_env IN ('production','sandbox'));
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_asaas_env_chk CHECK (asaas_env IN ('production','sandbox'));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_asaas_env_chk CHECK (asaas_env IN ('production','sandbox'));
ALTER TABLE public.asaas_webhook_events ADD CONSTRAINT asaas_webhook_events_asaas_env_chk CHECK (asaas_env IN ('production','sandbox'));
CREATE INDEX IF NOT EXISTS invoices_env_ext_idx ON public.invoices(asaas_env, external_invoice_id);
CREATE INDEX IF NOT EXISTS subscriptions_env_ext_idx ON public.subscriptions(asaas_env, external_subscription_id);

CREATE OR REPLACE FUNCTION public.asaas_env_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v text;
BEGIN
  IF TG_TABLE_NAME = 'subscriptions' AND NEW.billing_account_id IS NOT NULL THEN
    SELECT asaas_env INTO v FROM billing_accounts WHERE id = NEW.billing_account_id;
    IF v IS NOT NULL AND v <> NEW.asaas_env THEN
      RAISE EXCEPTION 'Ambiente do Asaas divergente entre assinatura e conta de cobrança' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' AND NEW.subscription_id IS NOT NULL THEN
    SELECT asaas_env INTO v FROM subscriptions WHERE id = NEW.subscription_id;
    IF v IS NOT NULL AND v <> NEW.asaas_env THEN
      RAISE EXCEPTION 'Ambiente do Asaas divergente entre fatura e assinatura' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.asaas_env_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS subscriptions_asaas_env_guard ON public.subscriptions;
CREATE TRIGGER subscriptions_asaas_env_guard BEFORE INSERT OR UPDATE OF asaas_env, billing_account_id ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.asaas_env_guard();
DROP TRIGGER IF EXISTS invoices_asaas_env_guard ON public.invoices;
CREATE TRIGGER invoices_asaas_env_guard BEFORE INSERT OR UPDATE OF asaas_env, subscription_id ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.asaas_env_guard();

CREATE TABLE IF NOT EXISTS public.asaas_env_divergencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  event_type text,
  evento_env text NOT NULL,
  registro_env text NOT NULL,
  tabela text NOT NULL,
  external_id text,
  detalhe text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.asaas_env_divergencias TO authenticated;
GRANT ALL ON public.asaas_env_divergencias TO service_role;
ALTER TABLE public.asaas_env_divergencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê divergências de ambiente" ON public.asaas_env_divergencias
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

-- Régua, conciliação, acesso e métricas passam a enxergar só produção.
DO $do$
DECLARE f text; d text; t text;
BEGIN
  FOREACH f IN ARRAY ARRAY['billing_dunning_scan','billing_v2_reconciliation','_module_access_core','company_access_status','company_grace_subscriptions','system_health_snapshot','billing_dunning_historico'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.proname = f AND p.pronamespace = 'public'::regnamespace;
    IF d IS NULL THEN CONTINUE; END IF;
    FOREACH t IN ARRAY ARRAY['subscriptions','invoices'] LOOP
      d := regexp_replace(d, '\m(FROM|JOIN)(\s+)(public\.)?' || t || '\M(\s+)(WHERE|ON|SET)\M',
             '\1 (SELECT * FROM public.' || t || ' WHERE asaas_env = ''production'') ' || t || '\4\5', 'gi');
      d := regexp_replace(d, '\m(FROM|JOIN)(\s+)(public\.)?' || t || '\M(\s+)(?!\(SELECT)([a-z_][a-z0-9_]*)',
             '\1 (SELECT * FROM public.' || t || ' WHERE asaas_env = ''production'') \5', 'gi');
    END LOOP;
    -- desfaz dupla aplicação
    FOREACH t IN ARRAY ARRAY['subscriptions','invoices'] LOOP
      d := replace(d, '(SELECT * FROM (SELECT * FROM public.' || t || ' WHERE asaas_env = ''production'') WHERE asaas_env = ''production'')', '(SELECT * FROM public.' || t || ' WHERE asaas_env = ''production'')');
    END LOOP;
    EXECUTE d;
  END LOOP;
END $do$;