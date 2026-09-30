CREATE OR REPLACE FUNCTION public.dp_solicitacao_criar_admin(p_colaborador uuid, p_tipo dp_solicitacao_tipo, p_data_alvo date, p_data_fim date DEFAULT NULL::date, p_motivo text DEFAULT NULL::text, p_arquivo_path text DEFAULT NULL::text, p_aprovada boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_setor uuid;
  v_lim jsonb;
  v_status public.dp_solicitacao_status;
  v_id uuid;
  v_dia date;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_tipo IS NULL OR p_data_alvo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador, tipo e data.' USING ERRCODE = '22023';
  END IF;
  IF p_data_fim IS NOT NULL AND p_data_fim < p_data_alvo THEN
    RAISE EXCEPTION 'INVALID_INPUT: a data fim não pode ser anterior à data inicial.' USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id, c.setor_id
    INTO v_company, v_unidade, v_cargo, v_setor
    FROM public.dp_colaboradores c
   WHERE c.id = p_colaborador AND c.deleted_at IS NULL;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NAO_ENCONTRADO: colaborador não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.' USING ERRCODE = '42501';
  END IF;

  v_status := CASE WHEN COALESCE(p_aprovada, false)
                   THEN 'aprovada'::public.dp_solicitacao_status
                   ELSE 'pendente'::public.dp_solicitacao_status END;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|folga_dia|' || COALESCE(v_unidade::text, 'sem') || '|' || p_data_alvo::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_colaborador::text || '|solic_' || p_tipo::text || '|' || p_data_alvo::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = p_colaborador AND s.tipo = p_tipo
       AND s.data_alvo = p_data_alvo
       AND s.status IN ('pendente'::public.dp_solicitacao_status, 'aprovada'::public.dp_solicitacao_status)
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação para este colaborador neste dia.'
      USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    v_lim := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data_alvo, p_colaborador, v_setor);
    IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
      RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status,
    arquivo_path, respondido_por, respondido_em)
  VALUES (v_company, p_colaborador, v_uid, p_tipo, p_data_alvo, p_data_fim,
          NULLIF(btrim(COALESCE(p_motivo, '')), ''), v_status,
          NULLIF(btrim(COALESCE(p_arquivo_path, '')), ''),
          CASE WHEN v_status = 'aprovada' THEN v_uid END,
          CASE WHEN v_status = 'aprovada' THEN now() END)
  RETURNING id INTO v_id;

  -- Folga registrada já aprovada pelo gestor precisa virar folga no calendário
  -- na mesma transação (antes só gravava a solicitação).
  IF v_status = 'aprovada'::public.dp_solicitacao_status
     AND p_tipo = 'folga'::public.dp_solicitacao_tipo THEN
    FOR v_dia IN
      SELECT d::date FROM generate_series(p_data_alvo, COALESCE(p_data_fim, p_data_alvo), interval '1 day') d
    LOOP
      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, criado_por, observacao)
      VALUES (v_company, p_colaborador, v_dia,
              'normal'::public.dp_folga_tipo, 'solicitacao'::public.dp_folga_origem,
              'agendada'::public.dp_folga_status, false, v_uid,
              'Folga registrada e aprovada pelo DP')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'status', v_status, 'limite', v_lim);
END;
$function$;