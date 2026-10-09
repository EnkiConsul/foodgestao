-- No modelo v2 a assinatura pertence à conta de cobrança: um dono pode ter várias contas (uma por empresa).
-- Mantém a unicidade por usuário para assinaturas legadas (sem conta) e passa a ser por conta nas demais.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_account_module
  ON public.subscriptions (coalesce(billing_account_id, user_id), module)
  WHERE status = ANY (ARRAY['trialing'::subscription_status,'active'::subscription_status,'past_due'::subscription_status,'pending'::subscription_status]);
DROP INDEX IF EXISTS public.idx_subscriptions_one_active_per_user_module;