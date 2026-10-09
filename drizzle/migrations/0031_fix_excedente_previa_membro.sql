CREATE OR REPLACE FUNCTION public.dp_colaborador_excedente_previa(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l jsonb; v_lim int; v_used int; v_preco int;
BEGIN
  IF auth.uid() IS NULL OR NOT public._is_company_member(_company_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  l := public.assinatura_limites(_company_id, 'pessoas');
  v_lim := COALESCE((l->'limits'->>'colaboradores')::int, -1);
  v_used := COALESCE((l->'used'->>'colaboradores')::int, 0);
  SELECT price_cents INTO v_preco FROM public.plan_addons WHERE module='pessoas' AND code='colaboradores' AND is_active LIMIT 1;
  RETURN jsonb_build_object(
    'modo', public._dp_excedente_modo(_company_id),
    'pode_gerir', public._dp_excedente_pode_gerir(_company_id),
    'atual', v_used, 'limite', v_lim, 'isento', COALESCE((l->>'exempt')::boolean, false),
    'valor_unit_cents', COALESCE(v_preco, 0));
END $function$;