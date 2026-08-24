-- =====================================================================
-- Fase 3B.1 · M11 — RPCs de planejamento (rascunho) e configuração
-- Criação idempotente por ID estável; edição com lock + controle otimista.
-- =====================================================================

-- Helper interno: registra evento (append-only)
CREATE OR REPLACE FUNCTION public.dp_convocacao_log_evento(
  _company_id uuid,
  _grupo_id uuid,
  _ocorrencia_id uuid,
  _tipo text,
  _payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.dp_convocacao_eventos(company_id, grupo_id, ocorrencia_id, tipo, ator_user_id, ator_papel, payload)
  VALUES (_company_id, _grupo_id, _ocorrencia_id, _tipo, auth.uid(), 'admin', COALESCE(_payload, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM authenticated;

-- Helper interno: exige admin/owner da empresa
CREATE OR REPLACE FUNCTION public.dp_convocacao_exige_admin(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED: é necessário estar autenticado.' USING ERRCODE = '42501';
  END IF;
  IF _company_id IS NULL OR NOT private.is_company_admin_or_owner(v_uid, _company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão de administrador nesta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_convocacao_exige_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_exige_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_exige_admin(uuid) FROM authenticated;

-- ---------------------------------------------------------------------
-- GRUPO · criar (idempotente por p_grupo_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_criar_grupo(
  p_grupo_id uuid,
  p_unidade_id uuid,
  p_competencia text,
  p_modalidade text,
  p_titulo text DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_row public.dp_convocacao_grupos;
  v_desejado jsonb;
  v_atual jsonb;
BEGIN
  IF p_grupo_id IS NULL OR p_unidade_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo e unidade são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = p_unidade_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'UNIT_NOT_FOUND: unidade inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_row FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF FOUND THEN
    v_atual := jsonb_build_object(
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id,
      'competencia', v_row.competencia, 'modalidade', v_row.modalidade,
      'titulo', v_row.titulo, 'observacao', v_row.observacao);
    v_desejado := jsonb_build_object(
      'company_id', v_company, 'unidade_id', p_unidade_id,
      'competencia', p_competencia, 'modalidade', p_modalidade,
      'titulo', p_titulo, 'observacao', p_observacao);
    IF v_atual = v_desejado THEN
      RETURN jsonb_build_object('grupo_id', v_row.id, 'company_id', v_row.company_id,
        'unidade_id', v_row.unidade_id, 'status', v_row.status,
        'updated_at', v_row.updated_at, 'idempotente', true);
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe um grupo com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.dp_convocacao_grupos(id, company_id, unidade_id, competencia, modalidade, titulo, observacao, status, criado_por)
  VALUES (p_grupo_id, v_company, p_unidade_id, p_competencia, p_modalidade, p_titulo, p_observacao, 'rascunho', v_uid)
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_company, v_row.id, NULL, 'grupo_criado',
    jsonb_build_object('competencia', v_row.competencia, 'modalidade', v_row.modalidade));

  RETURN jsonb_build_object('grupo_id', v_row.id, 'company_id', v_row.company_id,
    'unidade_id', v_row.unidade_id, 'status', v_row.status,
    'updated_at', v_row.updated_at, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- GRUPO · atualizar rascunho (lock + no-op + controle otimista)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_atualizar_grupo(
  p_grupo_id uuid,
  p_expected_updated_at timestamptz,
  p_competencia text,
  p_modalidade text,
  p_titulo text DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_convocacao_grupos;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.dp_convocacao_grupos WHERE id = p_grupo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_row.company_id);

  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: apenas grupos em rascunho podem ser editados.' USING ERRCODE = '22023';
  END IF;

  v_atual := jsonb_build_object('competencia', v_row.competencia, 'modalidade', v_row.modalidade,
    'titulo', v_row.titulo, 'observacao', v_row.observacao);
  v_desejado := jsonb_build_object('competencia', p_competencia, 'modalidade', p_modalidade,
    'titulo', p_titulo, 'observacao', p_observacao);

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('grupo_id', v_row.id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'alterado', false, 'idempotente', true);
  END IF;

  IF p_expected_updated_at IS NULL OR v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_grupos
     SET competencia = p_competencia,
         modalidade = p_modalidade,
         titulo = p_titulo,
         observacao = p_observacao,
         updated_at = now()
   WHERE id = p_grupo_id
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.id, NULL, 'grupo_atualizado',
    jsonb_build_object('de', v_atual, 'para', v_desejado));

  RETURN jsonb_build_object('grupo_id', v_row.id, 'status', v_row.status,
    'updated_at', v_row.updated_at, 'alterado', true, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- OCORRÊNCIA · criar (idempotente por p_ocorrencia_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_criar_ocorrencia(
  p_ocorrencia_id uuid,
  p_grupo_id uuid,
  p_cargo_id uuid,
  p_data date,
  p_necessidade_entrada time,
  p_necessidade_saida time,
  p_necessidade_termina_no_dia_seguinte boolean DEFAULT false,
  p_turno_referencia_id uuid DEFAULT NULL,
  p_horario_modo text DEFAULT 'horario_unico',
  p_entrada time DEFAULT NULL,
  p_saida time DEFAULT NULL,
  p_intervalo_minutos integer DEFAULT NULL,
  p_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_carga_prevista_horas numeric DEFAULT NULL,
  p_vagas integer DEFAULT 1,
  p_condicoes_comuns jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_grupo public.dp_convocacao_grupos;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificadores da ocorrência e do grupo são obrigatórios.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_grupo FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_grupo.company_id);

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: só é possível adicionar necessidades a um grupo em rascunho.' USING ERRCODE = '22023';
  END IF;

  v_desejado := jsonb_build_object(
    'company_id', v_grupo.company_id, 'grupo_id', v_grupo.id, 'unidade_id', v_grupo.unidade_id,
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb));

  SELECT * INTO v_row FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id;
  IF FOUND THEN
    v_atual := jsonb_build_object(
      'company_id', v_row.company_id, 'grupo_id', v_row.grupo_id, 'unidade_id', v_row.unidade_id,
      'cargo_id', v_row.cargo_id, 'data', v_row.data,
      'necessidade_entrada', v_row.necessidade_entrada, 'necessidade_saida', v_row.necessidade_saida,
      'necessidade_termina_no_dia_seguinte', v_row.necessidade_termina_no_dia_seguinte,
      'turno_referencia_id', v_row.turno_referencia_id, 'horario_modo', v_row.horario_modo,
      'entrada', v_row.entrada, 'saida', v_row.saida, 'intervalo_minutos', v_row.intervalo_minutos,
      'termina_no_dia_seguinte', v_row.termina_no_dia_seguinte, 'carga_prevista_horas', v_row.carga_prevista_horas,
      'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns);
    IF v_atual = v_desejado THEN
      RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
        'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
        'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', true);
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.dp_convocacao_ocorrencias(
    id, company_id, grupo_id, unidade_id, cargo_id, data,
    necessidade_entrada, necessidade_saida, necessidade_termina_no_dia_seguinte,
    turno_referencia_id, horario_modo, entrada, saida, intervalo_minutos,
    termina_no_dia_seguinte, carga_prevista_horas, vagas, condicoes_comuns, status, criado_por)
  VALUES (
    p_ocorrencia_id, v_grupo.company_id, v_grupo.id, v_grupo.unidade_id, p_cargo_id, p_data,
    p_necessidade_entrada, p_necessidade_saida, COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    p_turno_referencia_id, p_horario_modo, p_entrada, p_saida, p_intervalo_minutos,
    p_termina_no_dia_seguinte, p_carga_prevista_horas, COALESCE(p_vagas, 1),
    COALESCE(p_condicoes_comuns, '{}'::jsonb), 'rascunho', v_uid)
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_criada',
    jsonb_build_object('data', v_row.data, 'cargo_id', v_row.cargo_id, 'vagas', v_row.vagas));

  RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
    'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
    'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- OCORRÊNCIA · atualizar rascunho
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_atualizar_ocorrencia(
  p_ocorrencia_id uuid,
  p_expected_updated_at timestamptz,
  p_cargo_id uuid,
  p_data date,
  p_necessidade_entrada time,
  p_necessidade_saida time,
  p_necessidade_termina_no_dia_seguinte boolean DEFAULT false,
  p_turno_referencia_id uuid DEFAULT NULL,
  p_horario_modo text DEFAULT 'horario_unico',
  p_entrada time DEFAULT NULL,
  p_saida time DEFAULT NULL,
  p_intervalo_minutos integer DEFAULT NULL,
  p_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_carga_prevista_horas numeric DEFAULT NULL,
  p_vagas integer DEFAULT 1,
  p_condicoes_comuns jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador da necessidade é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_row.company_id);

  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: necessidade publicada deve ser alterada por revisão.' USING ERRCODE = '22023';
  END IF;

  v_atual := jsonb_build_object(
    'cargo_id', v_row.cargo_id, 'data', v_row.data,
    'necessidade_entrada', v_row.necessidade_entrada, 'necessidade_saida', v_row.necessidade_saida,
    'necessidade_termina_no_dia_seguinte', v_row.necessidade_termina_no_dia_seguinte,
    'turno_referencia_id', v_row.turno_referencia_id, 'horario_modo', v_row.horario_modo,
    'entrada', v_row.entrada, 'saida', v_row.saida, 'intervalo_minutos', v_row.intervalo_minutos,
    'termina_no_dia_seguinte', v_row.termina_no_dia_seguinte, 'carga_prevista_horas', v_row.carga_prevista_horas,
    'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns);

  v_desejado := jsonb_build_object(
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb));

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'alterado', false, 'idempotente', true);
  END IF;

  IF p_expected_updated_at IS NULL OR v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a necessidade foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_ocorrencias
     SET cargo_id = p_cargo_id,
         data = p_data,
         necessidade_entrada = p_necessidade_entrada,
         necessidade_saida = p_necessidade_saida,
         necessidade_termina_no_dia_seguinte = COALESCE(p_necessidade_termina_no_dia_seguinte, false),
         turno_referencia_id = p_turno_referencia_id,
         horario_modo = p_horario_modo,
         entrada = p_entrada,
         saida = p_saida,
         intervalo_minutos = p_intervalo_minutos,
         termina_no_dia_seguinte = p_termina_no_dia_seguinte,
         carga_prevista_horas = p_carga_prevista_horas,
         vagas = COALESCE(p_vagas, 1),
         condicoes_comuns = COALESCE(p_condicoes_comuns, '{}'::jsonb),
         updated_at = now()
   WHERE id = p_ocorrencia_id
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_atualizada',
    jsonb_build_object('de', v_atual, 'para', v_desejado));

  RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
    'updated_at', v_row.updated_at, 'alterado', true, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- OCORRÊNCIA · revisar (versionamento, idempotente por p_sucessora_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_revisar_ocorrencia(
  p_ocorrencia_id uuid,
  p_sucessora_id uuid,
  p_cargo_id uuid,
  p_data date,
  p_necessidade_entrada time,
  p_necessidade_saida time,
  p_necessidade_termina_no_dia_seguinte boolean DEFAULT false,
  p_turno_referencia_id uuid DEFAULT NULL,
  p_horario_modo text DEFAULT 'horario_unico',
  p_entrada time DEFAULT NULL,
  p_saida time DEFAULT NULL,
  p_intervalo_minutos integer DEFAULT NULL,
  p_termina_no_dia_seguinte boolean DEFAULT NULL,
  p_carga_prevista_horas numeric DEFAULT NULL,
  p_vagas integer DEFAULT 1,
  p_condicoes_comuns jsonb DEFAULT '{}'::jsonb,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_pred public.dp_convocacao_ocorrencias;
  v_grupo public.dp_convocacao_grupos;
  v_suc public.dp_convocacao_ocorrencias;
  v_existente public.dp_convocacao_ocorrencias;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_sucessora_id IS NULL OR p_ocorrencia_id = p_sucessora_id THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificadores de predecessora e sucessora inválidos.' USING ERRCODE = '22023';
  END IF;

  -- lock em ordem determinística: grupo -> predecessora
  SELECT g.* INTO v_grupo
    FROM public.dp_convocacao_grupos g
    JOIN public.dp_convocacao_ocorrencias o ON o.grupo_id = g.id
   WHERE o.id = p_ocorrencia_id
   FOR UPDATE OF g;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_grupo.company_id);

  SELECT * INTO v_pred FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id FOR UPDATE;
  IF v_pred.grupo_id <> v_grupo.id OR v_pred.company_id <> v_grupo.company_id THEN
    RAISE EXCEPTION 'CONTEXT_MISMATCH: necessidade não pertence ao grupo informado.' USING ERRCODE = '22023';
  END IF;

  -- sucessora já existente para esta predecessora?
  SELECT * INTO v_existente
    FROM public.dp_convocacao_ocorrencias
   WHERE substitui_ocorrencia_id = p_ocorrencia_id
   LIMIT 1;

  IF FOUND THEN
    IF v_existente.id = p_sucessora_id THEN
      RETURN jsonb_build_object('ocorrencia_id', v_pred.id, 'sucessora_id', v_existente.id,
        'versao', v_existente.versao, 'status', v_existente.status,
        'updated_at', v_existente.updated_at, 'idempotente', true);
    END IF;
    RAISE EXCEPTION 'REVISION_CONFLICT: esta necessidade já possui outra versão sucessora.' USING ERRCODE = '23505';
  END IF;

  IF v_pred.status NOT IN ('publicada', 'preenchida') THEN
    RAISE EXCEPTION 'INVALID_STATE: apenas necessidades publicadas podem ser revisadas.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_convocacao_ocorrencias WHERE id = p_sucessora_id) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: o identificador da nova versão já está em uso.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.dp_convocacao_ocorrencias(
    id, company_id, grupo_id, unidade_id, cargo_id, data,
    necessidade_entrada, necessidade_saida, necessidade_termina_no_dia_seguinte,
    turno_referencia_id, horario_modo, entrada, saida, intervalo_minutos,
    termina_no_dia_seguinte, carga_prevista_horas, vagas, condicoes_comuns,
    versao, substitui_ocorrencia_id, status, criado_por)
  VALUES (
    p_sucessora_id, v_pred.company_id, v_pred.grupo_id, v_pred.unidade_id, p_cargo_id, p_data,
    p_necessidade_entrada, p_necessidade_saida, COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    p_turno_referencia_id, p_horario_modo, p_entrada, p_saida, p_intervalo_minutos,
    p_termina_no_dia_seguinte, p_carga_prevista_horas, COALESCE(p_vagas, 1),
    COALESCE(p_condicoes_comuns, '{}'::jsonb),
    v_pred.versao + 1, v_pred.id, 'rascunho', v_uid)
  RETURNING * INTO v_suc;

  UPDATE public.dp_convocacao_ocorrencias
     SET status = 'revisada', updated_at = now()
   WHERE id = v_pred.id;

  PERFORM public.dp_convocacao_log_evento(v_pred.company_id, v_pred.grupo_id, v_pred.id, 'ocorrencia_revisada',
    jsonb_build_object('sucessora_id', v_suc.id, 'versao', v_suc.versao, 'motivo', p_motivo));

  RETURN jsonb_build_object('ocorrencia_id', v_pred.id, 'sucessora_id', v_suc.id,
    'versao', v_suc.versao, 'status', v_suc.status,
    'updated_at', v_suc.updated_at, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- CONFIG · salvar (empresa ou unidade)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_convocacao_salvar_config(
  p_company_id uuid,
  p_unidade_id uuid DEFAULT NULL,
  p_antecedencia_minima_dias integer DEFAULT 3,
  p_prazo_resposta_dias_uteis integer DEFAULT 1,
  p_aprovacao_modo text DEFAULT 'somente_excecoes',
  p_sub_intermitente_por_intermitente boolean DEFAULT true,
  p_sub_intermitente_por_freelancer boolean DEFAULT true,
  p_sub_freelancer_por_intermitente boolean DEFAULT true,
  p_sub_freelancer_por_freelancer boolean DEFAULT true,
  p_sub_fixo_em_folga_dominical boolean DEFAULT false,
  p_reabre_vaga_em_desistencia boolean DEFAULT true,
  p_autonomia_colaborador_desistir boolean DEFAULT true,
  p_permite_oferta_aberta boolean DEFAULT true,
  p_exige_justificativa_excecao boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_config;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = p_unidade_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'UNIT_NOT_FOUND: unidade inexistente.' USING ERRCODE = '23503';
    END IF;
  ELSE
    IF p_company_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a empresa ou a unidade.' USING ERRCODE = '22023';
    END IF;
    v_company := p_company_id;
  END IF;

  PERFORM public.dp_convocacao_exige_admin(v_company);

  v_desejado := jsonb_build_object(
    'antecedencia_minima_dias', p_antecedencia_minima_dias,
    'prazo_resposta_dias_uteis', p_prazo_resposta_dias_uteis,
    'aprovacao_modo', p_aprovacao_modo,
    'sub_intermitente_por_intermitente', p_sub_intermitente_por_intermitente,
    'sub_intermitente_por_freelancer', p_sub_intermitente_por_freelancer,
    'sub_freelancer_por_intermitente', p_sub_freelancer_por_intermitente,
    'sub_freelancer_por_freelancer', p_sub_freelancer_por_freelancer,
    'sub_fixo_em_folga_dominical', p_sub_fixo_em_folga_dominical,
    'reabre_vaga_em_desistencia', p_reabre_vaga_em_desistencia,
    'autonomia_colaborador_desistir', p_autonomia_colaborador_desistir,
    'permite_oferta_aberta', p_permite_oferta_aberta,
    'exige_justificativa_excecao', p_exige_justificativa_excecao);

  SELECT * INTO v_row
    FROM public.dp_convocacao_config
   WHERE company_id = v_company AND unidade_id IS NOT DISTINCT FROM p_unidade_id
   FOR UPDATE;

  IF FOUND THEN
    v_atual := jsonb_build_object(
      'antecedencia_minima_dias', v_row.antecedencia_minima_dias,
      'prazo_resposta_dias_uteis', v_row.prazo_resposta_dias_uteis,
      'aprovacao_modo', v_row.aprovacao_modo,
      'sub_intermitente_por_intermitente', v_row.sub_intermitente_por_intermitente,
      'sub_intermitente_por_freelancer', v_row.sub_intermitente_por_freelancer,
      'sub_freelancer_por_intermitente', v_row.sub_freelancer_por_intermitente,
      'sub_freelancer_por_freelancer', v_row.sub_freelancer_por_freelancer,
      'sub_fixo_em_folga_dominical', v_row.sub_fixo_em_folga_dominical,
      'reabre_vaga_em_desistencia', v_row.reabre_vaga_em_desistencia,
      'autonomia_colaborador_desistir', v_row.autonomia_colaborador_desistir,
      'permite_oferta_aberta', v_row.permite_oferta_aberta,
      'exige_justificativa_excecao', v_row.exige_justificativa_excecao);

    IF v_atual = v_desejado THEN
      RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
        'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
        'alterado', false, 'idempotente', true);
    END IF;

    UPDATE public.dp_convocacao_config
       SET antecedencia_minima_dias = p_antecedencia_minima_dias,
           prazo_resposta_dias_uteis = p_prazo_resposta_dias_uteis,
           aprovacao_modo = p_aprovacao_modo,
           sub_intermitente_por_intermitente = p_sub_intermitente_por_intermitente,
           sub_intermitente_por_freelancer = p_sub_intermitente_por_freelancer,
           sub_freelancer_por_intermitente = p_sub_freelancer_por_intermitente,
           sub_freelancer_por_freelancer = p_sub_freelancer_por_freelancer,
           sub_fixo_em_folga_dominical = p_sub_fixo_em_folga_dominical,
           reabre_vaga_em_desistencia = p_reabre_vaga_em_desistencia,
           autonomia_colaborador_desistir = p_autonomia_colaborador_desistir,
           permite_oferta_aberta = p_permite_oferta_aberta,
           exige_justificativa_excecao = p_exige_justificativa_excecao,
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;

    PERFORM public.dp_convocacao_log_evento(v_row.company_id, NULL, NULL, 'config_atualizada',
      jsonb_build_object('unidade_id', v_row.unidade_id, 'de', v_atual, 'para', v_desejado));

    RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
      'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
      'alterado', true, 'idempotente', false);
  END IF;

  INSERT INTO public.dp_convocacao_config(
    company_id, unidade_id, antecedencia_minima_dias, prazo_resposta_dias_uteis, aprovacao_modo,
    sub_intermitente_por_intermitente, sub_intermitente_por_freelancer,
    sub_freelancer_por_intermitente, sub_freelancer_por_freelancer,
    sub_fixo_em_folga_dominical, reabre_vaga_em_desistencia, autonomia_colaborador_desistir,
    permite_oferta_aberta, exige_justificativa_excecao)
  VALUES (
    v_company, p_unidade_id, p_antecedencia_minima_dias, p_prazo_resposta_dias_uteis, p_aprovacao_modo,
    p_sub_intermitente_por_intermitente, p_sub_intermitente_por_freelancer,
    p_sub_freelancer_por_intermitente, p_sub_freelancer_por_freelancer,
    p_sub_fixo_em_folga_dominical, p_reabre_vaga_em_desistencia, p_autonomia_colaborador_desistir,
    p_permite_oferta_aberta, p_exige_justificativa_excecao)
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, NULL, NULL, 'config_criada',
    jsonb_build_object('unidade_id', v_row.unidade_id, 'valores', v_desejado));

  RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
    'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
    'alterado', true, 'idempotente', false);
END;
$$;

-- Grants: PUBLIC/anon sem EXECUTE; authenticated somente nas RPCs do app
REVOKE ALL ON FUNCTION public.dp_convocacao_criar_grupo(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_grupo(uuid,timestamptz,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid,timestamptz,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_revisar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_salvar_config(uuid,uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_grupo(uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_grupo(uuid,timestamptz,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid,timestamptz,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_revisar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_salvar_config(uuid,uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean) TO authenticated;