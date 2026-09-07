CREATE OR REPLACE FUNCTION public.dp_disponibilidade_painel(
  _company_id uuid,
  _unidade_id uuid DEFAULT NULL::uuid,
  _competencia date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_janela jsonb;
  v_comp date;
  v_ini date;
  v_fim date;
  v_convocaveis int := 0;
  v_responderam int := 0;
  v_tardias int := 0;
  v_dias jsonb;
  v_colabs jsonb;
BEGIN
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a empresa.' USING ERRCODE = '22023';
  END IF;

  IF NOT private.is_company_admin_or_owner(_company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem consultar a disponibilidade.'
      USING ERRCODE = '42501';
  END IF;

  v_janela := public.dp_disponibilidade_janela(_company_id, _unidade_id, _competencia);
  v_comp := (v_janela->>'competencia')::date;
  v_ini := v_comp;
  v_fim := (v_comp + interval '1 month - 1 day')::date;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp_disp_noop(x int);

  WITH conv AS (
    SELECT c.id, c.nome, c.regime, c.unidade_id, c.cargo_id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id
       AND c.ativo = true
       AND c.deleted_at IS NULL
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
  ), ind AS (
    SELECT i.colaborador_id,
           count(*)::int AS dias,
           count(*) FILTER (WHERE i.alteracao_tardia)::int AS tardias,
           max(i.informada_em) AS ultima
      FROM public.dp_indisponibilidades i
      JOIN conv ON conv.id = i.colaborador_id
     WHERE i.cancelada_em IS NULL
       AND i.data BETWEEN v_ini AND v_fim
     GROUP BY i.colaborador_id
  )
  SELECT count(*)::int,
         count(*) FILTER (WHERE ind.colaborador_id IS NOT NULL)::int,
         COALESCE(sum(ind.tardias), 0)::int,
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'colaborador_id', conv.id,
             'nome', conv.nome,
             'regime', conv.regime,
             'unidade_nome', u.nome,
             'cargo_nome', cg.nome,
             'dias_indisponiveis', COALESCE(ind.dias, 0),
             'alteracoes_tardias', COALESCE(ind.tardias, 0),
             'informou', ind.colaborador_id IS NOT NULL,
             'ultima_informacao', ind.ultima)
           ORDER BY (ind.colaborador_id IS NOT NULL), conv.nome), '[]'::jsonb)
    INTO v_convocaveis, v_responderam, v_tardias, v_colabs
    FROM conv
    LEFT JOIN ind ON ind.colaborador_id = conv.id
    LEFT JOIN public.dp_unidades u ON u.id = conv.unidade_id
    LEFT JOIN public.dp_cargos cg ON cg.id = conv.cargo_id;

  WITH conv AS (
    SELECT c.id
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company_id
       AND c.ativo = true
       AND c.deleted_at IS NULL
       AND COALESCE(public.dp_regime_convocavel(c.regime), false)
       AND (_unidade_id IS NULL OR c.unidade_id = _unidade_id)
  ), dias AS (
    SELECT d::date AS data FROM generate_series(v_ini, v_fim, interval '1 day') d
  ), agg AS (
    SELECT dias.data,
           (SELECT count(*) FROM public.dp_indisponibilidades i
              JOIN conv ON conv.id = i.colaborador_id
             WHERE i.cancelada_em IS NULL AND i.data = dias.data)::int AS indisponiveis,
           (SELECT count(*) FROM public.dp_convocacoes v
              JOIN conv ON conv.id = v.colaborador_id
             WHERE v.data = dias.data AND v.status = 'pendente')::int AS pendentes,
           (SELECT count(*) FROM public.dp_convocacoes v
              JOIN conv ON conv.id = v.colaborador_id
             WHERE v.data = dias.data AND v.status = 'aceita')::int AS aceitas
      FROM dias
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'data', agg.data,
             'indisponiveis', agg.indisponiveis,
             'disponiveis', GREATEST(v_convocaveis - agg.indisponiveis, 0),
             'pendentes', agg.pendentes,
             'aceitas', agg.aceitas)
           ORDER BY agg.data), '[]'::jsonb)
    INTO v_dias
    FROM agg;

  RETURN jsonb_build_object(
    'janela', v_janela,
    'resumo', jsonb_build_object(
      'convocaveis', v_convocaveis,
      'informaram', v_responderam,
      'sem_informacao', GREATEST(v_convocaveis - v_responderam, 0),
      'alteracoes_tardias', v_tardias),
    'dias', v_dias,
    'colaboradores', v_colabs);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.dp_disponibilidade_painel(uuid, uuid, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_disponibilidade_painel(uuid, uuid, date) TO authenticated;