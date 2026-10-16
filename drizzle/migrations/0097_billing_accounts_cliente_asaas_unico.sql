CREATE UNIQUE INDEX IF NOT EXISTS billing_accounts_asaas_customer_unico
  ON public.billing_accounts (asaas_env, asaas_customer_id)
  WHERE asaas_customer_id IS NOT NULL;