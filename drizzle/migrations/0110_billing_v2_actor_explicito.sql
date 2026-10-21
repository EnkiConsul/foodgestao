DROP FUNCTION public.billing_v2_apply_change(uuid, text, text, text);
CREATE FUNCTION public.billing_v2_apply_change(_subscription_id uuid, _plan_slug text, _ciclo text, _origem text, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_aplicada', jsonb_build_object('plano', _plan_slug, 'ciclo', _ciclo, 'origem', _origem), COALESCE(_actor, public.billing_v2_actor()));
  RETURN jsonb_build_object('ok', true);
END $function$;
GRANT EXECUTE ON FUNCTION public.billing_v2_apply_change(uuid, text, text, text, uuid) TO service_role;

DROP FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text);
CREATE FUNCTION public.billing_v2_plan_change_schedule(_subscription_id uuid, _plan_slug text, _billing_cycle text, _actor uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE q jsonb; ant jsonb; ator uuid;
BEGIN
  ator := COALESCE(_actor, public.billing_v2_actor());
  q := public.billing_v2_plan_change_quote(_subscription_id, _plan_slug, _billing_cycle);
  IF NOT coalesce((q->>'ok')::boolean, false) THEN RETURN q; END IF;
  IF (q->>'imediato')::boolean THEN
    RETURN q || jsonb_build_object('ok', false, 'erros', jsonb_build_array('Upgrade é imediato e exige pagamento da diferença'));
  END IF;
  SELECT pending_plan_change INTO ant FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  UPDATE subscriptions SET pending_plan_change = jsonb_build_object(
      'plano', q->>'plano_novo', 'ciclo', q->>'ciclo_novo', 'tipo', q->>'tipo',
      'efetivo_em', q->>'efetivo_em', 'agendado_em', now(), 'agendado_por', ator),
    updated_at = now()
   WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_agendada', q || jsonb_build_object('substituiu', ant), ator);
  RETURN q || jsonb_build_object('agendado', true);
END $function$;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text, uuid) TO service_role;

DROP FUNCTION public.billing_v2_plan_change_cancel(uuid);
CREATE FUNCTION public.billing_v2_plan_change_cancel(_subscription_id uuid, _actor uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE ant jsonb;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  SELECT pending_plan_change INTO ant FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF ant IS NULL THEN RETURN; END IF;
  UPDATE subscriptions SET pending_plan_change = NULL, updated_at = now() WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_agendada_cancelada', ant, COALESCE(_actor, public.billing_v2_actor()));
END $function$;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_cancel(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_cancel(uuid, uuid) TO service_role;