CREATE OR REPLACE FUNCTION public._billing_v2_can_manage_sub(_subscription_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role' OR public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM subscriptions x JOIN billing_accounts a ON a.id = x.billing_account_id
     WHERE x.id = _subscription_id AND a.titular_user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public._billing_v2_can_manage_sub(uuid) FROM PUBLIC, anon, authenticated;

-- Cotação de troca de plano/ciclo. Regras confirmadas:
--  upgrade no mesmo ciclo: imediato, diferença proporcional aos dias restantes;
--  mensal -> anual: imediato, novo período de 12 meses com crédito do saldo mensal;
--  downgrade e anual -> mensal: agendados para a renovação, com checagem de uso.
CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_quote(_subscription_id uuid, _plan_slug text, _billing_cycle text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; pa record; pn record; l record; nl record;
  ciclo_atual text; ciclo_novo text := _billing_cycle;
  val_atual int; val_novo int; frac numeric := 0; credito int := 0; cobrar int := 0;
  tipo text; efetivo timestamptz; impeditivos jsonb := '[]'::jsonb; novo_lim int;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  IF ciclo_novo NOT IN ('mensal','anual') THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Ciclo inválido'));
  END IF;
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  IF s.status::text IN ('canceled','expired') THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Assinatura encerrada'));
  END IF;
  SELECT * INTO pa FROM plans WHERE id = s.plan_id;
  SELECT * INTO pn FROM plans WHERE slug = _plan_slug AND is_active;
  IF pn.id IS NULL OR pn.is_enterprise THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Plano indisponível para contratação direta'));
  END IF;
  IF pn.module <> coalesce(s.module, pa.module) THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('O novo plano é de outro módulo'));
  END IF;
  ciclo_atual := coalesce(s.billing_cycle, 'mensal');
  val_atual := CASE WHEN ciclo_atual = 'anual' THEN pa.price_annual_cents ELSE pa.price_monthly_cents END;
  val_novo  := CASE WHEN ciclo_novo  = 'anual' THEN pn.price_annual_cents ELSE pn.price_monthly_cents END;

  IF s.status::text = 'active' AND NOT coalesce(s.is_exempt, false)
     AND s.current_period_start IS NOT NULL AND s.current_period_end > now()
     AND s.current_period_end > s.current_period_start THEN
    frac := extract(epoch FROM (s.current_period_end - greatest(now(), s.current_period_start)))
          / extract(epoch FROM (s.current_period_end - s.current_period_start));
  END IF;

  IF pn.id = pa.id AND ciclo_novo = ciclo_atual THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Nenhuma alteração'));
  ELSIF ciclo_atual = 'mensal' AND ciclo_novo = 'anual' AND pn.price_monthly_cents >= pa.price_monthly_cents THEN
    tipo := 'troca_ciclo_anual';
    credito := round(val_atual * frac);
    cobrar := greatest(val_novo - credito, 0);
    efetivo := now();
  ELSIF ciclo_novo = ciclo_atual AND pn.price_monthly_cents > pa.price_monthly_cents THEN
    tipo := 'upgrade';
    credito := round(val_atual * frac);
    cobrar := greatest(round(val_novo * frac) - credito, 0);
    efetivo := now();
  ELSE
    tipo := CASE WHEN ciclo_atual = 'anual' AND ciclo_novo = 'mensal' THEN 'troca_ciclo_mensal' ELSE 'downgrade' END;
    efetivo := coalesce(s.current_period_end, now());
    FOR l IN SELECT * FROM public._billing_v2_limits(_subscription_id) LOOP
      SELECT * INTO nl FROM plan_limits WHERE plan_id = pn.id AND recurso = l.recurso;
      IF nl.recurso IS NULL OR nl.incluido IS NULL THEN CONTINUE; END IF;
      novo_lim := coalesce(l.override, nl.incluido + CASE WHEN nl.permite_adicional THEN coalesce(l.adicional,0) ELSE 0 END);
      IF coalesce(l.uso,0) > novo_lim THEN
        impeditivos := impeditivos || jsonb_build_object('recurso', l.recurso, 'uso', l.uso, 'limite_novo', novo_lim,
          'mensagem', format('Uso de %s (%s) acima do limite do novo plano (%s)', l.recurso, l.uso, novo_lim));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(impeditivos) = 0, 'tipo', tipo,
    'plano_atual', pa.slug, 'ciclo_atual', ciclo_atual, 'plano_novo', pn.slug, 'ciclo_novo', ciclo_novo,
    'valor_ciclo_atual_cents', val_atual, 'valor_ciclo_novo_cents', val_novo,
    'fracao_restante', round(frac, 6), 'credito_cents', credito, 'cobrar_agora_cents', cobrar,
    'imediato', tipo IN ('upgrade','troca_ciclo_anual'), 'efetivo_em', efetivo,
    'impeditivos', impeditivos, 'asaas_env', s.asaas_env);
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_plan_change_quote(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_quote(uuid, text, text) TO authenticated, service_role;

-- Agenda downgrade / anual -> mensal para a renovação. Upgrades exigem pagamento (checkout v2).
CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_schedule(_subscription_id uuid, _plan_slug text, _billing_cycle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q jsonb; ant jsonb;
BEGIN
  q := public.billing_v2_plan_change_quote(_subscription_id, _plan_slug, _billing_cycle);
  IF NOT coalesce((q->>'ok')::boolean, false) THEN RETURN q; END IF;
  IF (q->>'imediato')::boolean THEN
    RETURN q || jsonb_build_object('ok', false, 'erros', jsonb_build_array('Upgrade é imediato e exige pagamento da diferença'));
  END IF;
  SELECT pending_plan_change INTO ant FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  UPDATE subscriptions SET pending_plan_change = jsonb_build_object(
      'plano', q->>'plano_novo', 'ciclo', q->>'ciclo_novo', 'tipo', q->>'tipo',
      'efetivo_em', q->>'efetivo_em', 'agendado_em', now(), 'agendado_por', public.billing_v2_actor()),
    updated_at = now()
   WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_agendada', q || jsonb_build_object('substituiu', ant), public.billing_v2_actor());
  RETURN q || jsonb_build_object('agendado', true);
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_cancel(_subscription_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ant jsonb;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  SELECT pending_plan_change INTO ant FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF ant IS NULL THEN RETURN; END IF;
  UPDATE subscriptions SET pending_plan_change = NULL, updated_at = now() WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_agendada_cancelada', ant, public.billing_v2_actor());
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_plan_change_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_cancel(uuid) TO authenticated, service_role;

-- Aplica trocas agendadas vencidas (rotina interna). Revalida o uso antes de aplicar.
CREATE OR REPLACE FUNCTION public.billing_v2_apply_scheduled_changes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; q jsonb; n int := 0; pn uuid;
BEGIN
  FOR r IN SELECT * FROM subscriptions WHERE pending_plan_change IS NOT NULL
             AND (pending_plan_change->>'efetivo_em')::timestamptz <= now() FOR UPDATE SKIP LOCKED LOOP
    q := public.billing_v2_plan_change_quote(r.id, r.pending_plan_change->>'plano', r.pending_plan_change->>'ciclo');
    IF coalesce((q->>'ok')::boolean, false) OR (q->'erros') IS NULL AND jsonb_array_length(coalesce(q->'impeditivos','[]')) = 0 THEN
      SELECT id INTO pn FROM plans WHERE slug = r.pending_plan_change->>'plano';
      UPDATE subscriptions SET plan_id = pn, billing_cycle = r.pending_plan_change->>'ciclo',
             pending_plan_change = NULL, updated_at = now() WHERE id = r.id;
      INSERT INTO subscription_events(subscription_id, tipo_evento, payload) VALUES (r.id, 'troca_aplicada', q);
      n := n + 1;
    ELSE
      INSERT INTO subscription_events(subscription_id, tipo_evento, payload) VALUES (r.id, 'troca_bloqueada_uso', q);
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_apply_scheduled_changes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_apply_scheduled_changes() TO service_role;