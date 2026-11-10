-- Corrige assinatura_limites: COALESCE(status_enum, '') abortava a rotina inteira
-- (valor '' inválido para o enum), o que desligava em silêncio a checagem prévia de
-- franquia no app e impedia o aviso de excedente de abrir.
CREATE OR REPLACE FUNCTION public.assinatura_limites(_company_id uuid, _modulo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.subscriptions;
  v_features jsonb := '{}'::jsonb;
  v_owner uuid;
  v_exempt boolean := false;
  v_addons jsonb := '{}'::jsonb;
  v_limits jsonb := '{}'::jsonb;
  v_used jsonb := '{}'::jsonb;
  v_lim int;
  v_key text;
  v_map jsonb := jsonb_build_object(
    'colaboradores','max_collaborators',
    'unidades','max_units',
    'empresas','max_companies',
    'usuarios','max_users',
    'open_finance','max_open_finance',
    'contadores','accountant_seats'
  );
BEGIN
  SELECT user_id INTO v_owner FROM public.companies WHERE id = _company_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_owner = auth.uid() OR public.is_super_admin(auth.uid()) OR auth.role() = 'service_role'
          OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = auth.uid())) THEN
    RETURN NULL;
  END IF;

  SELECT s.* INTO v_sub FROM public.subscriptions s
  WHERE s.user_id = v_owner AND (s.module = _modulo OR s.module IS NULL)
  ORDER BY (s.module = _modulo) DESC, s.created_at DESC LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    SELECT COALESCE(p.features, '{}'::jsonb) INTO v_features FROM public.plans p WHERE p.id = v_sub.plan_id;
    v_exempt := COALESCE(v_sub.is_exempt, false) AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until > now());
    SELECT COALESCE(jsonb_object_agg(a.code, sa.qty), '{}'::jsonb) INTO v_addons
    FROM (SELECT addon_id, SUM(quantity)::int AS qty FROM public.subscription_addons
          WHERE subscription_id = v_sub.id AND status = 'active' GROUP BY addon_id) sa
    JOIN public.plan_addons a ON a.id = sa.addon_id;
  ELSE
    v_exempt := true;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_map) LOOP
    IF v_exempt THEN
      v_limits := v_limits || jsonb_build_object(v_key, -1);
    ELSE
      v_lim := NULLIF(v_features ->> (v_map ->> v_key), '')::int;
      IF v_lim IS NULL THEN
        v_limits := v_limits || jsonb_build_object(v_key, -1);
      ELSE
        v_limits := v_limits || jsonb_build_object(v_key, v_lim + COALESCE((v_addons ->> v_key)::int, 0));
      END IF;
    END IF;
  END LOOP;

  v_used := jsonb_build_object(
    'colaboradores', (SELECT COUNT(*) FROM public.dp_colaboradores c WHERE c.company_id = _company_id AND c.ativo AND c.desligado_em IS NULL),
    'unidades', (SELECT COUNT(*) FROM public.dp_unidades u WHERE u.company_id = _company_id AND u.ativo),
    'empresas', (SELECT COUNT(*) FROM public.companies c WHERE c.user_id = v_owner),
    'usuarios', (SELECT COUNT(*) FROM public.company_members m WHERE m.company_id = _company_id AND m.role <> 'contabilidade'),
    'open_finance', (SELECT COUNT(*) FROM public.pluggy_connections pc WHERE pc.company_id = _company_id AND (pc.status IS NULL OR pc.status::text NOT IN ('deleted','revoked'))),
    'contadores', (SELECT COUNT(*) FROM public.company_members m WHERE m.company_id = _company_id AND m.role = 'contabilidade')
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'module', _modulo,
    'exempt', v_exempt,
    'limits', v_limits,
    'used', v_used,
    'addons', v_addons
  );
END; $function$;

-- Prévia da franquia: informa plano por colaborador ativo (Enterprise, sem trava)
-- e, em plano de franquia fixa cheia, a sugestão do Enterprise com os dois valores.
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
  END IF;
  v_unit := NULLIF(v_plan.features->>'price_per_collaborator_cents', '')::int;

  IF v_unit IS NULL AND v_plan.id IS NOT NULL AND v_lim >= 0 AND v_used + 1 > v_lim THEN
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
    'sugestao_upgrade', v_sug);
END $function$;