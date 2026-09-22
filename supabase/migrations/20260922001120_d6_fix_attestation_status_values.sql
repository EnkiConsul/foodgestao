-- Match dp_solicitacao_status enum labels; leave unrelated HR enums unchanged.
CREATE OR REPLACE FUNCTION public.dp_solicitacao_atestado_ocorrencias()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tipo <> 'atestado' OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'aprovada' THEN
    PERFORM public.dp_ocorrencia_atestado_aplicar(NEW.id);
  ELSIF NEW.status IN ('recusada','cancelada') THEN
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
    SELECT o.company_id, o.id, 'atestado_recusado', 'tipo', o.tipo::text, 'falta',
           jsonb_build_object('motivo', NEW.resposta_admin), NEW.respondido_por
      FROM public.dp_ocorrencias o
     WHERE o.solicitacao_id = NEW.id AND o.estado <> 'cancelada';

    UPDATE public.dp_ocorrencias o
       SET tipo = CASE WHEN o.tipo = 'ausencia_justificada' THEN 'falta'::public.dp_ocorrencia_tipo ELSE o.tipo END,
           impacta_assiduidade = 'aguardando',
           impacta_ferias = 'aguardando',
           analise_status = 'pendente',
           analisado_por = NULL,
           analisado_em = NULL,
           justificativa_final = NULL,
           tratativa_observacao = COALESCE(NULLIF(btrim(COALESCE(NEW.resposta_admin,'')),''), 'Atestado recusado'),
           updated_at = now()
     WHERE o.solicitacao_id = NEW.id AND o.estado <> 'cancelada';
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_atestado_aplicar(_solicitacao_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sol record; v_dia date; v_prev record; v_cfg record;
  v_existente record; v_id uuid; v_criadas integer := 0;
BEGIN
  SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id;
  IF v_sol.id IS NULL OR v_sol.tipo <> 'atestado' THEN RETURN 0; END IF;
  IF v_sol.status <> 'aprovada' THEN RETURN 0; END IF;

  SELECT * INTO v_cfg FROM public.dp_ocorrencia_tipo_config
   WHERE company_id = v_sol.company_id AND tipo = 'ausencia_justificada';

  v_dia := v_sol.data_alvo;
  WHILE v_dia <= COALESCE(v_sol.data_fim, v_sol.data_alvo) LOOP
    -- Férias em curso: nada a registrar
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos g
       WHERE g.colaborador_id = v_sol.colaborador_id
         AND g.status NOT IN ('cancelado','recusado')
         AND v_dia BETWEEN g.data_inicio AND g.data_fim
    ) THEN v_dia := v_dia + 1; CONTINUE; END IF;

    -- Folga do dia: nada a registrar
    IF EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = v_sol.colaborador_id
         AND f.data = v_dia
         AND f.status NOT IN ('cancelada','recusada')
    ) THEN v_dia := v_dia + 1; CONTINUE; END IF;

    SELECT * INTO v_prev FROM public.dp_ocorrencia_previsto(v_sol.colaborador_id, v_dia);

    -- Ocorrência de falta/ausência já registrada nesse dia: vincula ao atestado
    SELECT id, tipo INTO v_existente FROM public.dp_ocorrencias
     WHERE colaborador_id = v_sol.colaborador_id
       AND data_operacional = v_dia
       AND estado <> 'cancelada'
       AND tipo IN ('falta','previsao_falta','ausencia_justificada','atestado')
     ORDER BY created_at
     LIMIT 1;

    IF v_existente.id IS NOT NULL THEN
      UPDATE public.dp_ocorrencias
         SET solicitacao_id = _solicitacao_id,
             impacta_assiduidade = 'nao',
             impacta_ferias = 'nao',
             justificativa_final = COALESCE(justificativa_final, 'Atestado aprovado'),
             analise_status = 'analisada',
             analisado_em = COALESCE(analisado_em, now()),
             updated_at = now()
       WHERE id = v_existente.id
         AND solicitacao_id IS DISTINCT FROM _solicitacao_id;

      INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_novo, metadata, autor_id)
      SELECT v_sol.company_id, v_existente.id, 'atestado_vinculado', 'solicitacao_id', _solicitacao_id::text,
             jsonb_build_object('data_operacional', v_dia), auth.uid()
       WHERE NOT EXISTS (
         SELECT 1 FROM public.dp_ocorrencia_eventos e
          WHERE e.ocorrencia_id = v_existente.id AND e.tipo_evento = 'atestado_vinculado'
            AND e.valor_novo = _solicitacao_id::text
       );
      v_dia := v_dia + 1; CONTINUE;
    END IF;

    -- Sem trabalho previsto no dia: não gera ausência
    IF v_prev.entrada IS NULL THEN v_dia := v_dia + 1; CONTINUE; END IF;

    INSERT INTO public.dp_ocorrencias (
      company_id, colaborador_id, unidade_id, setor_id, data_operacional, tipo, estado, origem,
      previsto_entrada, previsto_saida, justificativa_inicial, justificativa_final,
      impacta_assiduidade, impacta_ferias, relevancia_operacional,
      tratativa_ponto, tratativa_status, analise_status, analisado_em,
      solicitacao_id, criado_por
    ) VALUES (
      v_sol.company_id, v_sol.colaborador_id, v_prev.unidade_id, v_prev.setor_id, v_dia,
      'ausencia_justificada', 'confirmada', 'sistema',
      v_prev.entrada, v_prev.saida,
      COALESCE(NULLIF(btrim(COALESCE(v_sol.motivo,'')),''), 'Atestado médico'),
      'Atestado aprovado',
      COALESCE(v_cfg.impacta_assiduidade,'nao'), COALESCE(v_cfg.impacta_ferias,'nao'),
      COALESCE(v_cfg.relevancia_operacional,true),
      COALESCE(v_cfg.exige_tratativa_ponto,false),
      CASE WHEN COALESCE(v_cfg.exige_tratativa_ponto,false)
           THEN 'pendente'::public.dp_ocorrencia_tratativa_status
           ELSE 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status END,
      'analisada', now(),
      _solicitacao_id, v_sol.respondido_por
    ) RETURNING id INTO v_id;

    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, metadata, autor_id)
    VALUES (v_sol.company_id, v_id, 'ocorrencia_criada', 'ausencia_justificada',
            jsonb_build_object('origem', 'atestado', 'solicitacao_id', _solicitacao_id, 'data_operacional', v_dia),
            v_sol.respondido_por);

    v_criadas := v_criadas + 1;
    v_dia := v_dia + 1;
  END LOOP;

  RETURN v_criadas;
END;
$function$
;
