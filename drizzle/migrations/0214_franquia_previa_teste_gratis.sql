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
  v_status text; v_trial_fim timestamptz;
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
    'minimo_colaboradores', NULLIF(v_plan.features->>'min_collaborators', '')::int,
    'em_teste', COALESCE(v_status = 'trialing', false),
    'teste_termina_em', CASE WHEN v_status = 'trialing' THEN v_trial_fim END,
    'sugestao_upgrade', v_sug);
END $function$;