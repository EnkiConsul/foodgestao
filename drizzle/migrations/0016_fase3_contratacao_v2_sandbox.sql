ALTER TABLE public.billing_accounts ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.billing_accounts ADD CONSTRAINT billing_accounts_test_so_sandbox CHECK (NOT is_test OR asaas_env = 'sandbox');
COMMENT ON COLUMN public.billing_accounts.is_test IS 'Conta de TESTE (sempre sandbox): fora de métricas, régua e acesso de produção.';

-- Dono da empresa coberta ou owner/admin também gerenciam a assinatura
CREATE OR REPLACE FUNCTION public._billing_v2_can_manage_sub(_subscription_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.role() = 'service_role' OR public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM subscriptions x JOIN billing_accounts a ON a.id = x.billing_account_id
     WHERE x.id = _subscription_id AND a.titular_user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM subscriptions x
      JOIN billing_account_companies b ON b.billing_account_id = x.billing_account_id AND b.removed_at IS NULL
      JOIN companies c ON c.id = b.company_id
      LEFT JOIN company_members m ON m.company_id = c.id AND m.user_id = auth.uid()
     WHERE x.id = _subscription_id AND (c.user_id = auth.uid() OR m.role::text IN ('owner','admin')))
$$;

-- Aplica uma troca (imediata ou agendada) só no banco; Asaas e e-mail ficam na função do servidor.
CREATE OR REPLACE FUNCTION public.billing_v2_apply_change(_subscription_id uuid, _plan_slug text, _ciclo text, _origem text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s record; pn uuid; anual_novo boolean := (_ciclo = 'anual'); muda_ciclo boolean;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada'; END IF;
  SELECT id INTO pn FROM plans WHERE slug = _plan_slug AND is_active;
  IF pn IS NULL THEN RAISE EXCEPTION 'Plano inexistente'; END IF;
  muda_ciclo := coalesce(s.billing_cycle,'mensal') <> _ciclo;
  UPDATE subscriptions SET plan_id = pn, billing_cycle = _ciclo, pending_plan_change = NULL,
    current_period_start = CASE WHEN _origem = 'imediata' AND muda_ciclo THEN now() ELSE current_period_start END,
    current_period_end = CASE
      WHEN _origem = 'imediata' AND muda_ciclo THEN now() + interval '1 year'
      WHEN _origem = 'agendada' THEN greatest(coalesce(current_period_end, now()), now())
             + CASE WHEN anual_novo THEN interval '1 year' ELSE interval '1 month' END
      ELSE current_period_end END,
    updated_at = now()
  WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload)
  VALUES (_subscription_id, 'troca_aplicada', jsonb_build_object('plano', _plan_slug, 'ciclo', _ciclo, 'origem', _origem));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Trocas e cancelamentos vencidos: produção, ou teste explicitamente marcado
CREATE OR REPLACE FUNCTION public.billing_v2_renovacoes_devidas(_somente_teste boolean DEFAULT false)
 RETURNS TABLE(subscription_id uuid, acao text, asaas_env text, is_test boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.id, CASE WHEN s.cancel_at_period_end THEN 'cancelar' ELSE 'troca' END, s.asaas_env, a.is_test
    FROM subscriptions s JOIN billing_accounts a ON a.id = s.billing_account_id
   WHERE s.status::text NOT IN ('canceled','expired')
     AND (s.asaas_env = 'production' OR a.is_test)
     AND (NOT _somente_teste OR a.is_test)
     AND ((s.cancel_at_period_end AND s.current_period_end <= now())
       OR (NOT coalesce(s.cancel_at_period_end,false) AND s.pending_plan_change IS NOT NULL
           AND (s.pending_plan_change->>'efetivo_em')::timestamptz <= now()))
$$;

REVOKE ALL ON FUNCTION public.billing_v2_apply_change(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_v2_renovacoes_devidas(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_apply_change(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_v2_renovacoes_devidas(boolean) TO service_role;