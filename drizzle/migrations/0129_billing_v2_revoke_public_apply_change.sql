REVOKE ALL ON FUNCTION public.billing_v2_apply_change(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_apply_change(uuid, text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_cancel(_subscription_id uuid, _actor uuid DEFAULT NULL::uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ant jsonb; ator uuid;
BEGIN
  ator := CASE WHEN auth.role() = 'service_role' THEN COALESCE(_actor, public.billing_v2_actor()) ELSE auth.uid() END;
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  SELECT pending_plan_change INTO ant FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF ant IS NULL THEN RETURN; END IF;
  UPDATE subscriptions SET pending_plan_change = NULL, updated_at = now() WHERE id = _subscription_id;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_agendada_cancelada', ant, ator);
END $function$;

CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_schedule(_subscription_id uuid, _plan_slug text, _billing_cycle text, _actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE q jsonb; ant jsonb; ator uuid;
BEGIN
  ator := CASE WHEN auth.role() = 'service_role' THEN COALESCE(_actor, public.billing_v2_actor()) ELSE auth.uid() END;
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

REVOKE ALL ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_v2_plan_change_cancel(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_schedule(uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_cancel(uuid, uuid) TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;