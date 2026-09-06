CREATE OR REPLACE FUNCTION public.dp_convocacao_pre_avaliar_grupo(
  p_grupo_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_restrito boolean;
  v_ocor record;
  v_cand record;
  v_aval jsonb;
  v_linhas jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso negado.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_convocacao_destinatarios d
     WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
       AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
  ) INTO v_restrito;

  FOR v_ocor IN
    SELECT o.*
      FROM public.dp_convocacao_ocorrencias o
     WHERE o.grupo_id = v_grupo.id
       AND o.company_id = v_company
       AND o.status = 'rascunho'
     ORDER BY o.data, o.cargo_id
  LOOP
    FOR v_cand IN
      SELECT c.id, c.nome
        FROM public.dp_colaboradores c
       WHERE c.company_id = v_company
         AND c.cargo_id = v_ocor.cargo_id
         AND c.unidade_id IS NOT NULL
         AND c.unidade_id = v_ocor.unidade_id
         AND c.ativo IS NOT FALSE
         AND public.dp_regime_convocavel(c.regime)
         AND (
           NOT v_restrito
           OR EXISTS (
             SELECT 1 FROM public.dp_convocacao_destinatarios d
              WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
                AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
                AND d.colaborador_id = c.id)
         )
       ORDER BY c.nome, c.id
    LOOP
      v_aval := public.dp_convocacao_avaliar_candidato(v_cand.id, v_ocor.id, NULL, true);
      v_aval := public.dp_convocacao_horario_efetivo(v_ocor.id, v_cand.id, v_aval);

      v_linhas := v_linhas || jsonb_build_object(
        'ocorrencia_id', v_ocor.id,
        'data', v_ocor.data,
        'cargo_id', v_ocor.cargo_id,
        'vagas', v_ocor.vagas,
        'necessidade_entrada', v_ocor.necessidade_entrada,
        'necessidade_saida', v_ocor.necessidade_saida,
        'necessidade_termina_no_dia_seguinte',
          COALESCE(v_ocor.necessidade_termina_no_dia_seguinte, false),
        'horario_modo', v_ocor.horario_modo,
        'colaborador_id', v_cand.id,
        'colaborador_nome', v_cand.nome,
        'apto', COALESCE((v_aval->>'apto')::boolean, false),
        'motivo', v_aval->>'motivo',
        'entrada', v_aval->>'entrada',
        'saida', v_aval->>'saida',
        'termina_no_dia_seguinte', COALESCE((v_aval->>'termina_no_dia_seguinte')::boolean, false),
        'jornada', public.dp_convocacao_jornada_na_data(v_cand.id, v_ocor.data)
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'restrito', v_restrito,
    'linhas', v_linhas);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_convocacao_pre_avaliar_grupo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_pre_avaliar_grupo(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_pre_avaliar_grupo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_pre_avaliar_grupo(uuid) TO service_role;