CREATE OR REPLACE FUNCTION public.assinatura_limite_excedido(_company_id uuid, _modulo text, _recurso text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_sub public.subscriptions;
  v_features jsonb := '{}'::jsonb;
  v_exempt boolean := false;
  v_addon int := 0;
  v_lim int;
  v_used int;
  v_col text := CASE _recurso
    WHEN 'colaboradores' THEN 'max_collaborators'
    WHEN 'unidades' THEN 'max_units'
    ELSE NULL END;
BEGIN
  IF v_col IS NULL OR _company_id IS NULL THEN RETURN false; END IF;

  SELECT user_id INTO v_owner FROM public.companies WHERE id = _company_id;
  IF v_owner IS NULL THEN RETURN false; END IF;

  SELECT s.* INTO v_sub FROM public.subscriptions s
  WHERE s.user_id = v_owner AND (s.module = _modulo OR s.module IS NULL)
  ORDER BY (s.module = _modulo) DESC, s.created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN RETURN false; END IF;

  v_exempt := COALESCE(v_sub.is_exempt, false) AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until > now());
  IF v_exempt THEN RETURN false; END IF;

  -- Teste grátis em vigor: colaboradores sem franquia nem cobrança extra (o plano é enquadrado no fim do teste).
  IF _recurso = 'colaboradores' AND v_sub.status::text = 'trialing'
     AND COALESCE(v_sub.trial_ends_at > now(), false) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.features, '{}'::jsonb) INTO v_features FROM public.plans p WHERE p.id = v_sub.plan_id;
  v_lim := NULLIF(v_features ->> v_col, '')::int;
  IF v_lim IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(SUM(sa.quantity), 0)::int INTO v_addon
  FROM public.subscription_addons sa
  JOIN public.plan_addons a ON a.id = sa.addon_id
  WHERE sa.subscription_id = v_sub.id AND sa.status = 'active' AND a.code = _recurso;

  IF _recurso = 'colaboradores' THEN
    SELECT COUNT(*) INTO v_used FROM public.dp_colaboradores c
    WHERE c.company_id = _company_id AND c.ativo AND c.desligado_em IS NULL;
  ELSE
    SELECT COUNT(*) INTO v_used FROM public.dp_unidades u
    WHERE u.company_id = _company_id AND u.ativo;
  END IF;

  RETURN v_used > (v_lim + v_addon);
END; $function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_excedente_previa(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l jsonb; v_lim int; v_used int; v_preco int;
  v_plan public.plans; v_ent public.plans;
  v_unit int; v_ent_unit int; v_ent_min int; v_base int; v_sug jsonb;
  v_status text; v_trial_fim timestamptz; v_em_teste boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public._is_company_member(_company_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  l := public.assinatura_limites(_company_id, 'pessoas');
  v_lim := COALESCE((l->'limits'->>'colaboradores')::int, -1);
  v_used := COALESCE((l->'used'->>'colaboradores')::int, 0);
  SELECT price_cents INTO v_preco FROM public.plan_addons WHERE module='pessoas' AND code='colaboradores' AND is_active LIMIT 1;

  IF (l->>'subscription_id') IS NOT NULL THEN
    SELECT p.* INTO v_plan FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
     WHERE s.id = (l->>'subscription_id')::uuid;
    SELECT s.status::text, s.trial_ends_at INTO v_status, v_trial_fim
      FROM public.subscriptions s WHERE s.id = (l->>'subscription_id')::uuid;
  END IF;
  v_em_teste := COALESCE(v_status = 'trialing' AND v_trial_fim > now(), false);
  v_unit := NULLIF(v_plan.features->>'price_per_collaborator_cents', '')::int;

  IF NOT v_em_teste AND v_unit IS NULL AND v_plan.id IS NOT NULL AND v_lim >= 0 AND v_used + 1 > v_lim THEN
    SELECT * INTO v_ent FROM public.plans
     WHERE module = 'pessoas' AND is_active AND is_public
       AND NULLIF(features->>'price_per_collaborator_cents', '') IS NOT NULL
     ORDER BY sort_order LIMIT 1;
    IF v_ent.id IS NOT NULL THEN
      v_ent_unit := (v_ent.features->>'price_per_collaborator_cents')::int;
      v_ent_min := GREATEST(1, COALESCE(NULLIF(v_ent.features->>'min_collaborators', '')::int, 1));
      v_base := COALESCE(NULLIF(v_plan.features->>'max_collaborators', '')::int, 0);
      v_sug := jsonb_build_object(
        'plano', v_ent.slug, 'nome', v_ent.name,
        'unitario_cents', v_ent_unit, 'minimo', v_ent_min,
        'valor_enterprise_cents', GREATEST(v_ent_min, v_used + 1) * v_ent_unit,
        'valor_atual_cents', COALESCE(v_plan.price_monthly_cents, 0) + GREATEST(0, v_used + 1 - v_base) * COALESCE(v_preco, 0));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'modo', public._dp_excedente_modo(_company_id),
    'pode_gerir', public._dp_excedente_pode_gerir(_company_id),
    'atual', v_used, 'limite', v_lim, 'isento', COALESCE((l->>'exempt')::boolean, false),
    'valor_unit_cents', COALESCE(v_preco, 0),
    'plano', v_plan.slug, 'plano_nome', v_plan.name,
    'por_colaborador_cents', v_unit,
    'minimo_colaboradores', NULLIF(v_plan.features->>'min_collaborators', '')::int,
    'em_teste', v_em_teste,
    'teste_termina_em', CASE WHEN v_em_teste THEN v_trial_fim END,
    'sugestao_upgrade', v_sug);
END $function$;