-- Risco de perder o prêmio de assiduidade: sinalização no registro e decisão do gestor.

ALTER TABLE public.dp_ocorrencias
  ADD COLUMN IF NOT EXISTS assiduidade_risco boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assiduidade_risco_motivo text,
  ADD COLUMN IF NOT EXISTS assiduidade_decidido_por uuid,
  ADD COLUMN IF NOT EXISTS assiduidade_decidido_em timestamptz,
  ADD COLUMN IF NOT EXISTS assiduidade_observacao text;

CREATE INDEX IF NOT EXISTS idx_dp_ocorrencias_assiduidade_pendente
  ON public.dp_ocorrencias (company_id, data_operacional)
  WHERE assiduidade_risco AND impacta_assiduidade = 'aguardando' AND estado <> 'cancelada';

-- Avaliação da regra do colaborador (fonte única no servidor).
CREATE OR REPLACE FUNCTION private.dp_assiduidade_risco(
  _colaborador_id uuid,
  _tipo public.dp_ocorrencia_tipo,
  _minutos integer DEFAULT NULL
) RETURNS TABLE (risco boolean, motivo text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE c record; v_tol integer; v_max_atrasos integer; v_max_atestados integer; v_criterio text;
BEGIN
  SELECT premio_assiduidade, premio_assiduidade_valor, assiduidade_criterio,
         assiduidade_tolerancia_min, assiduidade_max_atrasos,
         assiduidade_considera_atestado, assiduidade_max_atestados
    INTO c
    FROM public.dp_colaboradores WHERE id = _colaborador_id;

  IF c IS NULL OR COALESCE(c.premio_assiduidade,false) = false
     OR COALESCE(c.premio_assiduidade_valor,0) <= 0 THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  v_criterio := COALESCE(c.assiduidade_criterio, 'sem_faltas_sem_atrasos');
  v_tol := GREATEST(0, COALESCE(c.assiduidade_tolerancia_min, 0));
  v_max_atrasos := GREATEST(0, COALESCE(c.assiduidade_max_atrasos, 0));
  v_max_atestados := GREATEST(0, COALESCE(c.assiduidade_max_atestados, 0));

  IF _tipo IN ('falta','previsao_falta') THEN
    RETURN QUERY SELECT true, 'Falta registrada — pode custar o prêmio de assiduidade.'::text;
    RETURN;
  END IF;

  IF _tipo = 'atestado' THEN
    IF COALESCE(c.assiduidade_considera_atestado, true) THEN
      RETURN QUERY SELECT true,
        CASE WHEN v_max_atestados > 0
          THEN format('Atestado apresentado — a regra tolera %s atestado(s) no mês antes de perder o prêmio de assiduidade.', v_max_atestados)
          ELSE 'Atestado apresentado — a regra não tolera atestado, pode custar o prêmio de assiduidade.'
        END::text;
    ELSE
      RETURN QUERY SELECT false, NULL::text;
    END IF;
    RETURN;
  END IF;

  IF _tipo IN ('atraso','previsao_atraso','atraso_intervalo','previsao_atraso_intervalo',
               'saida_antecipada','previsao_saida_antecipada') THEN
    IF v_criterio = 'sem_faltas' THEN
      RETURN QUERY SELECT false, NULL::text;
      RETURN;
    END IF;
    IF _minutos IS NULL THEN
      RETURN QUERY SELECT true,
        'Horário ainda não informado — se passar da tolerância, pode custar o prêmio de assiduidade.'::text;
      RETURN;
    END IF;
    IF _minutos > v_tol THEN
      RETURN QUERY SELECT true,
        format('Atraso de %s minuto(s) acima da tolerância de %s minuto(s)%s — pode custar o prêmio de assiduidade.',
               _minutos, v_tol,
               CASE WHEN v_max_atrasos > 0 THEN format(' (a regra tolera %s no mês)', v_max_atrasos) ELSE '' END)::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION private.dp_assiduidade_risco(uuid, public.dp_ocorrencia_tipo, integer) FROM PUBLIC, anon, authenticated;

-- Registro: grava o risco e deixa a decisão pendente para o gestor.
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_registrar(_colaborador_id uuid, _data date, _tipo dp_ocorrencia_tipo, _justificativa text DEFAULT NULL::text, _horario_estimado time without time zone DEFAULT NULL::time without time zone, _horario_real time without time zone DEFAULT NULL::time without time zone, _marcacao_alvo dp_ocorrencia_marcacao DEFAULT NULL::dp_ocorrencia_marcacao, _estado dp_ocorrencia_estado DEFAULT NULL::dp_ocorrencia_estado, _documento_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid; v_is_gestor boolean; v_self uuid;
  v_prazo smallint; v_prev record; v_cfg record;
  v_estado public.dp_ocorrencia_estado; v_previsto time; v_minutos integer;
  v_existente uuid; v_id uuid; v_antec integer; v_risco record;
  v_impacto public.dp_ocorrencia_impacto;
BEGIN
  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_COLABORADOR_NAO_ENCONTRADO'; END IF;

  -- Somente vínculo ativo pode registrar por conta própria.
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  v_is_gestor := private.is_company_admin_or_owner(auth.uid(), v_company);
  IF NOT v_is_gestor AND v_self IS DISTINCT FROM _colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;

  SELECT prazo_retroativo_dias INTO v_prazo FROM public.dp_ocorrencia_config(v_company);
  IF NOT v_is_gestor AND _data < (CURRENT_DATE - v_prazo) THEN
    RAISE EXCEPTION 'OCORRENCIA_PRAZO_RETROATIVO';
  END IF;

  SELECT * INTO v_prev FROM public.dp_ocorrencia_previsto(_colaborador_id, _data);
  SELECT * INTO v_cfg FROM public.dp_ocorrencia_tipo_config
   WHERE company_id = v_company AND tipo = _tipo;

  v_previsto := CASE
    WHEN _tipo IN ('atraso','previsao_atraso') THEN v_prev.entrada
    WHEN _tipo IN ('saida_antecipada','previsao_saida_antecipada') THEN v_prev.saida
    ELSE NULL END;

  v_estado := COALESCE(_estado, CASE
    WHEN _tipo IN ('previsao_falta','previsao_atraso','previsao_saida_antecipada','previsao_atraso_intervalo')
      THEN 'aguardando_confirmacao'::public.dp_ocorrencia_estado
    ELSE 'informada'::public.dp_ocorrencia_estado END);

  IF _horario_real IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_real - v_previsto)) / 60)::int;
  ELSIF _horario_estimado IS NOT NULL AND v_previsto IS NOT NULL THEN
    v_minutos := ABS(EXTRACT(EPOCH FROM (_horario_estimado - v_previsto)) / 60)::int;
  END IF;

  IF v_previsto IS NOT NULL THEN
    v_antec := GREATEST(0, (EXTRACT(EPOCH FROM ((_data + v_previsto) - now()::timestamp)) / 60)::int);
  END IF;

  SELECT id INTO v_existente FROM public.dp_ocorrencias
   WHERE colaborador_id = _colaborador_id AND data_operacional = _data
     AND estado <> 'cancelada'
     AND COALESCE(marcacao_alvo::text,'') = COALESCE(_marcacao_alvo::text,'')
     AND tipo IN (_tipo,
        CASE _tipo
          WHEN 'atraso' THEN 'previsao_atraso'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
          WHEN 'falta' THEN 'previsao_falta'::public.dp_ocorrencia_tipo
          WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
          WHEN 'saida_antecipada' THEN 'previsao_saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
          WHEN 'atraso_intervalo' THEN 'previsao_atraso_intervalo'::public.dp_ocorrencia_tipo
          WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
          ELSE _tipo END)
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RAISE EXCEPTION 'OCORRENCIA_DUPLICADA:%', v_existente;
  END IF;

  SELECT * INTO v_risco FROM private.dp_assiduidade_risco(_colaborador_id, _tipo, v_minutos);

  v_impacto := COALESCE(v_cfg.impacta_assiduidade,'aguardando');
  IF COALESCE(v_risco.risco,false) THEN
    v_impacto := 'aguardando';
  END IF;

  INSERT INTO public.dp_ocorrencias (
    company_id, colaborador_id, unidade_id, setor_id, data_operacional, tipo, estado, origem,
    previsto_entrada, previsto_saida, horario_previsto, horario_estimado, horario_real, minutos,
    justificativa_inicial, impacta_assiduidade, impacta_ferias, relevancia_operacional,
    tratativa_ponto, tratativa_status, marcacao_alvo, documento_id,
    antecedencia_minutos, criado_por, assiduidade_risco, assiduidade_risco_motivo
  ) VALUES (
    v_company, _colaborador_id, v_prev.unidade_id, v_prev.setor_id, _data, _tipo, v_estado,
    CASE WHEN v_self IS NOT DISTINCT FROM _colaborador_id THEN 'colaborador'::public.dp_ocorrencia_origem
         ELSE 'gestor'::public.dp_ocorrencia_origem END,
    v_prev.entrada, v_prev.saida, v_previsto, _horario_estimado, _horario_real, v_minutos,
    NULLIF(btrim(COALESCE(_justificativa,'')),''),
    v_impacto, COALESCE(v_cfg.impacta_ferias,'aguardando'),
    COALESCE(v_cfg.relevancia_operacional,true),
    COALESCE(v_cfg.exige_tratativa_ponto,false),
    CASE WHEN COALESCE(v_cfg.exige_tratativa_ponto,false) THEN 'pendente'::public.dp_ocorrencia_tratativa_status
         ELSE 'nao_se_aplica'::public.dp_ocorrencia_tratativa_status END,
    _marcacao_alvo, _documento_id, v_antec, auth.uid(),
    COALESCE(v_risco.risco,false), v_risco.motivo
  ) RETURNING id INTO v_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, valor_novo, metadata, autor_id)
  VALUES (v_company, v_id, 'ocorrencia_criada', _tipo::text,
          jsonb_build_object('estado', v_estado, 'data_operacional', _data), auth.uid());

  IF COALESCE(v_risco.risco,false) THEN
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_novo, metadata, autor_id)
    VALUES (v_company, v_id, 'assiduidade_risco', 'assiduidade_risco', 'true',
            jsonb_build_object('motivo', v_risco.motivo, 'minutos', v_minutos), auth.uid());
  END IF;

  RETURN v_id;
END;
$function$;

-- Confirmação da previsão: recalcula o risco com o horário real, sem sobrescrever decisão já tomada.
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_confirmar(_ocorrencia_id uuid, _horario_real time without time zone DEFAULT NULL::time without time zone, _justificativa_final text DEFAULT NULL::text, _confirmar_falta boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE o record; v_novo public.dp_ocorrencia_tipo; v_min integer; v_self uuid;
        v_risco record; v_decidida boolean;
BEGIN
  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = _ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;
  v_self := public.dp_colaborador_ativo_of(auth.uid());
  IF NOT private.is_company_admin_or_owner(auth.uid(), o.company_id) AND v_self IS DISTINCT FROM o.colaborador_id THEN
    RAISE EXCEPTION 'OCORRENCIA_SEM_PERMISSAO';
  END IF;
  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;

  v_novo := CASE o.tipo
    WHEN 'previsao_atraso' THEN 'atraso'::public.dp_ocorrencia_tipo
    WHEN 'previsao_falta' THEN 'falta'::public.dp_ocorrencia_tipo
    WHEN 'previsao_saida_antecipada' THEN 'saida_antecipada'::public.dp_ocorrencia_tipo
    WHEN 'previsao_atraso_intervalo' THEN 'atraso_intervalo'::public.dp_ocorrencia_tipo
    ELSE o.tipo END;

  IF NOT _confirmar_falta THEN
    UPDATE public.dp_ocorrencias SET estado = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(),
      motivo_cancelamento = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''),'Não se confirmou')
      WHERE id = _ocorrencia_id;
    INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, autor_id)
    VALUES (o.company_id, _ocorrencia_id, 'ocorrencia_cancelada', auth.uid());
    RETURN;
  END IF;

  IF _horario_real IS NOT NULL AND o.horario_previsto IS NOT NULL THEN
    v_min := ABS(EXTRACT(EPOCH FROM (_horario_real - o.horario_previsto)) / 60)::int;
  END IF;

  UPDATE public.dp_ocorrencias SET
    tipo = v_novo,
    estado = 'confirmada',
    horario_real = COALESCE(_horario_real, horario_real),
    minutos = COALESCE(v_min, minutos),
    justificativa_final = COALESCE(NULLIF(btrim(COALESCE(_justificativa_final,'')),''), justificativa_final),
    relevancia_operacional = COALESCE((
      SELECT relevancia FROM public.dp_ocorrencia_tipo_config WHERE company_id = o.company_id AND tipo = v_novo
    ), true)
  WHERE id = _ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, _ocorrencia_id, 'previsao_confirmada', 'tipo', o.tipo::text, v_novo::text,
          jsonb_build_object('horario_real', _horario_real, 'minutos', v_min), auth.uid());

  -- Decisão já tomada pelo gestor não é reescrita.
  v_decidida := o.assiduidade_decidido_em IS NOT NULL;
  IF NOT v_decidida THEN
    SELECT * INTO v_risco FROM private.dp_assiduidade_risco(
      o.colaborador_id, v_novo, COALESCE(v_min, o.minutos));
    IF COALESCE(v_risco.risco,false) IS DISTINCT FROM o.assiduidade_risco
       OR COALESCE(v_risco.motivo,'') IS DISTINCT FROM COALESCE(o.assiduidade_risco_motivo,'') THEN
      UPDATE public.dp_ocorrencias SET
        assiduidade_risco = COALESCE(v_risco.risco,false),
        assiduidade_risco_motivo = v_risco.motivo,
        impacta_assiduidade = CASE WHEN COALESCE(v_risco.risco,false)
          THEN 'aguardando'::public.dp_ocorrencia_impacto ELSE impacta_assiduidade END
      WHERE id = _ocorrencia_id;
      INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
      VALUES (o.company_id, _ocorrencia_id, 'assiduidade_risco', 'assiduidade_risco',
              o.assiduidade_risco::text, COALESCE(v_risco.risco,false)::text,
              jsonb_build_object('motivo', v_risco.motivo), auth.uid());
    END IF;
  END IF;
END;
$function$;

-- Decisão do gestor sobre o prêmio.
CREATE OR REPLACE FUNCTION public.dp_ocorrencia_assiduidade_decidir(
  p_ocorrencia_id uuid,
  p_perde boolean,
  p_observacao text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE o record; v_obs text; v_nome text; v_user uuid; v_comp text;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_perde IS NULL THEN
    RAISE EXCEPTION 'ASSIDUIDADE_DADOS_OBRIGATORIOS';
  END IF;

  SELECT * INTO o FROM public.dp_ocorrencias WHERE id = p_ocorrencia_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA'; END IF;

  PERFORM private.dp_regras_admin(o.company_id);

  IF o.estado = 'cancelada' THEN RAISE EXCEPTION 'OCORRENCIA_CANCELADA'; END IF;
  IF NOT o.assiduidade_risco THEN RAISE EXCEPTION 'ASSIDUIDADE_SEM_RISCO'; END IF;

  v_obs := NULLIF(btrim(COALESCE(p_observacao,'')),'');
  IF NOT p_perde AND v_obs IS NULL THEN
    RAISE EXCEPTION 'ASSIDUIDADE_MOTIVO_OBRIGATORIO';
  END IF;

  -- Idempotência: mesma decisão já registrada não gera novo evento nem novo aviso.
  IF o.assiduidade_decidido_em IS NOT NULL THEN
    IF (o.impacta_assiduidade = 'sim') IS NOT DISTINCT FROM p_perde
       AND COALESCE(o.assiduidade_observacao,'') IS NOT DISTINCT FROM COALESCE(v_obs,'') THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'ASSIDUIDADE_JA_DECIDIDA';
  END IF;

  UPDATE public.dp_ocorrencias SET
    impacta_assiduidade = CASE WHEN p_perde THEN 'sim'::public.dp_ocorrencia_impacto
                               ELSE 'nao'::public.dp_ocorrencia_impacto END,
    assiduidade_observacao = v_obs,
    assiduidade_decidido_por = auth.uid(),
    assiduidade_decidido_em = now()
  WHERE id = p_ocorrencia_id;

  INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
  VALUES (o.company_id, p_ocorrencia_id, 'assiduidade_decidida', 'impacta_assiduidade',
          o.impacta_assiduidade::text, CASE WHEN p_perde THEN 'sim' ELSE 'nao' END,
          jsonb_build_object('observacao', v_obs, 'motivo_risco', o.assiduidade_risco_motivo), auth.uid());

  IF p_perde THEN
    SELECT user_id INTO v_user FROM public.dp_colaboradores WHERE id = o.colaborador_id;
    v_comp := to_char(o.data_operacional, 'MM/YYYY');
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins, chave
    ) VALUES (
      o.company_id, v_user, o.colaborador_id, 'assiduidade_decidida',
      'Prêmio de assiduidade afetado',
      format('A ocorrência de %s foi analisada e vai descontar o prêmio de assiduidade da competência %s.%s',
             to_char(o.data_operacional, 'DD/MM/YYYY'), v_comp,
             CASE WHEN v_obs IS NOT NULL THEN ' Observação: ' || v_obs ELSE '' END),
      'dp_ocorrencias', p_ocorrencia_id, false,
      'assiduidade_decidida:' || p_ocorrencia_id::text
    ) ON CONFLICT (chave) WHERE chave IS NOT NULL DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_ocorrencia_assiduidade_decidir(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_assiduidade_decidir(uuid, boolean, text) TO authenticated, service_role;