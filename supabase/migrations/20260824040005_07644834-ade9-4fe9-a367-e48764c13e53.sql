-- =====================================================================
-- Fase 3B.1 · M13 — correções de concorrência/idempotência (incremental)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 7. Papel real do ator (fail closed)
-- ---------------------------------------------------------------------
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
DECLARE
  v_uid uuid := auth.uid();
  v_papel text;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT cm.role::text INTO v_papel
      FROM public.company_members cm
     WHERE cm.user_id = v_uid
       AND cm.company_id = _company_id
       AND cm.role::text IN ('owner','admin')
     ORDER BY CASE cm.role::text WHEN 'owner' THEN 0 ELSE 1 END
     LIMIT 1;
    IF v_papel IS NULL THEN
      RAISE EXCEPTION 'AUDIT_ACTOR_ROLE_UNRESOLVED: não foi possível resolver o papel do usuário nesta empresa.' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.dp_convocacao_eventos(company_id, grupo_id, ocorrencia_id, tipo, ator_user_id, ator_papel, payload)
  VALUES (_company_id, _grupo_id, _ocorrencia_id, _tipo, v_uid, v_papel, COALESCE(_payload, '{}'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM authenticated;

-- ---------------------------------------------------------------------
-- 6. Eventos sem referência — fail closed (par explícito)
-- ---------------------------------------------------------------------
ALTER TABLE public.dp_convocacao_eventos
  DROP CONSTRAINT dp_conv_evento_referencia_check;

ALTER TABLE public.dp_convocacao_eventos
  ADD CONSTRAINT dp_conv_evento_referencia_check CHECK (
    grupo_id IS NOT NULL
    OR ocorrencia_id IS NOT NULL
    OR convocacao_id IS NOT NULL
    OR tipo IN ('config_criada','config_atualizada')
  );

CREATE OR REPLACE FUNCTION public.dp_conv_evento_deriva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_conv_company uuid;
  v_conv_ocorrencia uuid;
  v_ocor_company uuid;
  v_ocor_grupo uuid;
BEGIN
  IF NEW.grupo_id IS NULL AND NEW.ocorrencia_id IS NULL AND NEW.convocacao_id IS NULL THEN
    IF NEW.tipo IN ('config_criada','config_atualizada') THEN
      IF NEW.company_id IS NULL
         OR NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = NEW.company_id) THEN
        RAISE EXCEPTION 'EVENTO_CONFIG_SEM_EMPRESA';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'EVENTO_SEM_REFERENCIA';
  END IF;

  IF NEW.convocacao_id IS NOT NULL THEN
    SELECT company_id, ocorrencia_id INTO v_conv_company, v_conv_ocorrencia
      FROM public.dp_convocacoes WHERE id = NEW.convocacao_id;
    IF v_conv_company IS NULL THEN RAISE EXCEPTION 'CONVOCACAO_INEXISTENTE'; END IF;
    v_company := v_conv_company;

    IF NEW.ocorrencia_id IS NOT NULL AND v_conv_ocorrencia IS DISTINCT FROM NEW.ocorrencia_id THEN
      RAISE EXCEPTION 'EVENTO_OCORRENCIA_INCOERENTE';
    END IF;
    IF NEW.ocorrencia_id IS NULL THEN
      NEW.ocorrencia_id := v_conv_ocorrencia;
    END IF;
  END IF;

  IF NEW.ocorrencia_id IS NOT NULL THEN
    SELECT company_id, grupo_id INTO v_ocor_company, v_ocor_grupo
      FROM public.dp_convocacao_ocorrencias WHERE id = NEW.ocorrencia_id;
    IF v_ocor_company IS NULL THEN RAISE EXCEPTION 'OCORRENCIA_INEXISTENTE'; END IF;
    IF v_company IS NULL THEN
      v_company := v_ocor_company;
    ELSIF v_company IS DISTINCT FROM v_ocor_company THEN
      RAISE EXCEPTION 'EVENTO_OCORRENCIA_INCOERENTE';
    END IF;

    IF NEW.grupo_id IS NOT NULL AND v_ocor_grupo IS DISTINCT FROM NEW.grupo_id THEN
      RAISE EXCEPTION 'EVENTO_GRUPO_INCOERENTE';
    END IF;
    IF NEW.grupo_id IS NULL THEN
      NEW.grupo_id := v_ocor_grupo;
    END IF;
  END IF;

  IF v_company IS NULL THEN
    SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = NEW.grupo_id;
    IF v_company IS NULL THEN RAISE EXCEPTION 'GRUPO_INEXISTENTE'; END IF;
  END IF;

  NEW.company_id := v_company;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------
-- 1. GRUPO · criar concorrência-safe
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

  v_desejado := jsonb_build_object(
    'company_id', v_company, 'unidade_id', p_unidade_id,
    'competencia', p_competencia, 'modalidade', p_modalidade,
    'titulo', p_titulo, 'observacao', p_observacao);

  INSERT INTO public.dp_convocacao_grupos(id, company_id, unidade_id, competencia, modalidade, titulo, observacao, status, criado_por)
  VALUES (p_grupo_id, v_company, p_unidade_id, p_competencia, p_modalidade, p_titulo, p_observacao, 'rascunho', v_uid)
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND AND v_row.id IS NOT NULL THEN
    PERFORM public.dp_convocacao_log_evento(v_company, v_row.id, NULL, 'grupo_criado',
      jsonb_build_object('competencia', v_row.competencia, 'modalidade', v_row.modalidade));

    RETURN jsonb_build_object('grupo_id', v_row.id, 'company_id', v_row.company_id,
      'unidade_id', v_row.unidade_id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'idempotente', false);
  END IF;

  -- perdeu a corrida: reconsulta tenant-scoped (nunca cross-tenant, nunca FOR UPDATE só por id)
  SELECT * INTO v_row
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company AND unidade_id = p_unidade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe um grupo com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

  v_atual := jsonb_build_object(
    'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id,
    'competencia', v_row.competencia, 'modalidade', v_row.modalidade,
    'titulo', v_row.titulo, 'observacao', v_row.observacao);

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('grupo_id', v_row.id, 'company_id', v_row.company_id,
      'unidade_id', v_row.unidade_id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'idempotente', true);
  END IF;

  RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe um grupo com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
END;
$$;

-- ---------------------------------------------------------------------
-- 0. GRUPO · atualizar — autorizar antes do lock
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
  v_company uuid;
  v_row public.dp_convocacao_grupos;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador do grupo é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_row
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

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
-- 1+2. OCORRÊNCIA · criar (retry reconciliado antes de exigir rascunho)
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

  -- 1) contexto sem lock + autorização
  SELECT * INTO v_grupo FROM public.dp_convocacao_grupos WHERE id = p_grupo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_grupo.company_id);

  v_desejado := jsonb_build_object(
    'company_id', v_grupo.company_id, 'grupo_id', v_grupo.id, 'unidade_id', v_grupo.unidade_id,
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb));

  -- 2) reconciliação do retry ANTES de exigir rascunho
  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id
     AND company_id = v_grupo.company_id
     AND grupo_id = v_grupo.id;

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

  IF EXISTS (SELECT 1 FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

  -- 3) inexistente: travar o grupo, revalidar contexto e estado
  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_grupo.company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'NOT_DRAFT: só é possível adicionar necessidades a um grupo em rascunho.' USING ERRCODE = '22023';
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
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND AND v_row.id IS NOT NULL THEN
    PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_criada',
      jsonb_build_object('data', v_row.data, 'cargo_id', v_row.cargo_id, 'vagas', v_row.vagas));

    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
      'status', v_row.status, 'updated_at', v_row.updated_at, 'idempotente', false);
  END IF;

  -- 4) perdeu a corrida: reconciliar por consulta tenant-scoped
  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id
     AND company_id = v_grupo.company_id
     AND grupo_id = v_grupo.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

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
END;
$$;

-- ---------------------------------------------------------------------
-- 0. OCORRÊNCIA · atualizar — autorizar antes do lock
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
  v_company uuid;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
BEGIN
  IF p_ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador da necessidade é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  PERFORM public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_row
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

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
-- 3+4. OCORRÊNCIA · revisar (ordem pred->suc, reconciliação completa)
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
  v_company uuid;
  v_grupo_id uuid;
  v_pred public.dp_convocacao_ocorrencias;
  v_grupo public.dp_convocacao_grupos;
  v_suc public.dp_convocacao_ocorrencias;
  v_existente public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
  v_motivo_evento text;
  v_eventos integer;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_sucessora_id IS NULL OR p_ocorrencia_id = p_sucessora_id THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificadores de predecessora e sucessora inválidos.' USING ERRCODE = '22023';
  END IF;

  -- contexto sem lock + autorização (nunca travar antes de autorizar)
  SELECT company_id, grupo_id INTO v_company, v_grupo_id
    FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  v_uid := public.dp_convocacao_exige_admin(v_company);

  -- lock em ordem determinística: grupo -> predecessora
  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = v_grupo_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo inexistente.' USING ERRCODE = '23503';
  END IF;

  SELECT * INTO v_pred
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id AND company_id = v_company
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: necessidade inexistente.' USING ERRCODE = '23503';
  END IF;
  IF v_pred.grupo_id <> v_grupo.id OR v_pred.company_id <> v_grupo.company_id THEN
    RAISE EXCEPTION 'CONTEXT_MISMATCH: necessidade não pertence ao grupo informado.' USING ERRCODE = '22023';
  END IF;

  v_desejado := jsonb_build_object(
    'company_id', v_pred.company_id, 'grupo_id', v_pred.grupo_id, 'unidade_id', v_pred.unidade_id,
    'substitui_ocorrencia_id', v_pred.id, 'versao', v_pred.versao + 1,
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb));

  -- sucessora já existente para esta predecessora?
  SELECT * INTO v_existente
    FROM public.dp_convocacao_ocorrencias
   WHERE substitui_ocorrencia_id = p_ocorrencia_id
   LIMIT 1;

  IF FOUND THEN
    IF v_existente.id <> p_sucessora_id THEN
      RAISE EXCEPTION 'REVISION_CONFLICT: esta necessidade já possui outra versão sucessora.' USING ERRCODE = '23505';
    END IF;

    -- coerência da cadeia (fail closed)
    IF v_pred.status <> 'revisada'
       OR v_existente.company_id <> v_pred.company_id
       OR v_existente.grupo_id <> v_pred.grupo_id
       OR v_existente.unidade_id <> v_pred.unidade_id
       OR v_existente.substitui_ocorrencia_id IS DISTINCT FROM v_pred.id
       OR v_existente.versao <> v_pred.versao + 1 THEN
      RAISE EXCEPTION 'REVISION_INCONSISTENT: a cadeia de versões desta necessidade está em estado incoerente.' USING ERRCODE = '22023';
    END IF;

    v_atual := jsonb_build_object(
      'company_id', v_existente.company_id, 'grupo_id', v_existente.grupo_id, 'unidade_id', v_existente.unidade_id,
      'substitui_ocorrencia_id', v_existente.substitui_ocorrencia_id, 'versao', v_existente.versao,
      'cargo_id', v_existente.cargo_id, 'data', v_existente.data,
      'necessidade_entrada', v_existente.necessidade_entrada, 'necessidade_saida', v_existente.necessidade_saida,
      'necessidade_termina_no_dia_seguinte', v_existente.necessidade_termina_no_dia_seguinte,
      'turno_referencia_id', v_existente.turno_referencia_id, 'horario_modo', v_existente.horario_modo,
      'entrada', v_existente.entrada, 'saida', v_existente.saida, 'intervalo_minutos', v_existente.intervalo_minutos,
      'termina_no_dia_seguinte', v_existente.termina_no_dia_seguinte, 'carga_prevista_horas', v_existente.carga_prevista_horas,
      'vagas', v_existente.vagas, 'condicoes_comuns', v_existente.condicoes_comuns);

    IF v_atual <> v_desejado THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma revisão com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
    END IF;

    -- motivo: exatamente um evento correspondente à dupla predecessora + sucessora
    SELECT count(*) INTO v_eventos
      FROM public.dp_convocacao_eventos e
     WHERE e.tipo = 'ocorrencia_revisada'
       AND e.company_id = v_pred.company_id
       AND e.ocorrencia_id = v_pred.id
       AND (e.payload ->> 'sucessora_id') = v_existente.id::text;

    IF v_eventos <> 1 THEN
      RAISE EXCEPTION 'REVISION_INCONSISTENT: histórico da revisão está incoerente.' USING ERRCODE = '22023';
    END IF;

    SELECT e.payload ->> 'motivo' INTO v_motivo_evento
      FROM public.dp_convocacao_eventos e
     WHERE e.tipo = 'ocorrencia_revisada'
       AND e.company_id = v_pred.company_id
       AND e.ocorrencia_id = v_pred.id
       AND (e.payload ->> 'sucessora_id') = v_existente.id::text;

    IF v_motivo_evento IS DISTINCT FROM p_motivo THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: a revisão já registrada possui outro motivo.' USING ERRCODE = '23505';
    END IF;

    RETURN jsonb_build_object('ocorrencia_id', v_pred.id, 'sucessora_id', v_existente.id,
      'versao', v_existente.versao, 'status', v_existente.status,
      'updated_at', v_existente.updated_at, 'idempotente', true);
  END IF;

  IF v_pred.status NOT IN ('publicada', 'preenchida') THEN
    RAISE EXCEPTION 'INVALID_STATE: apenas necessidades publicadas podem ser revisadas.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_convocacao_ocorrencias WHERE id = p_sucessora_id) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: o identificador da nova versão já está em uso.' USING ERRCODE = '23505';
  END IF;

  -- predecessora marcada como revisada ANTES da sucessora (índice de vigência)
  UPDATE public.dp_convocacao_ocorrencias
     SET status = 'revisada', updated_at = now()
   WHERE id = v_pred.id;

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

  PERFORM public.dp_convocacao_log_evento(v_pred.company_id, v_pred.grupo_id, v_pred.id, 'ocorrencia_revisada',
    jsonb_build_object('sucessora_id', v_suc.id, 'versao', v_suc.versao, 'motivo', p_motivo));

  RETURN jsonb_build_object('ocorrencia_id', v_pred.id, 'sucessora_id', v_suc.id,
    'versao', v_suc.versao, 'status', v_suc.status,
    'updated_at', v_suc.updated_at, 'idempotente', false);
END;
$$;

-- ---------------------------------------------------------------------
-- 5. CONFIG · controle otimista + criação concorrente
-- ---------------------------------------------------------------------
DROP FUNCTION public.dp_convocacao_salvar_config(uuid,uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean);

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
  p_exige_justificativa_excecao boolean DEFAULT true,
  p_expected_updated_at timestamptz DEFAULT NULL
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

  IF NOT FOUND THEN
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
    ON CONFLICT ON CONSTRAINT uq_dp_conv_config_escopo DO NOTHING
    RETURNING * INTO v_row;

    IF FOUND AND v_row.id IS NOT NULL THEN
      PERFORM public.dp_convocacao_log_evento(v_row.company_id, NULL, NULL, 'config_criada',
        jsonb_build_object('unidade_id', v_row.unidade_id, 'valores', v_desejado));

      RETURN jsonb_build_object('config_id', v_row.id, 'company_id', v_row.company_id,
        'unidade_id', v_row.unidade_id, 'updated_at', v_row.updated_at,
        'alterado', true, 'idempotente', false);
    END IF;

    -- perdeu a corrida da criação: relê a linha do mesmo escopo com lock
    SELECT * INTO v_row
      FROM public.dp_convocacao_config
     WHERE company_id = v_company AND unidade_id IS NOT DISTINCT FROM p_unidade_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a configuração foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
    END IF;
  END IF;

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

  IF p_expected_updated_at IS NULL OR v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a configuração foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
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
END;
$$;

-- ---------------------------------------------------------------------
-- Privilégios explícitos (estado final)
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.dp_convocacao_criar_grupo(uuid,uuid,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_grupo(uuid,timestamptz,text,text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid,timestamptz,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_revisar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_salvar_config(uuid,uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_grupo(uuid,uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_grupo(uuid,timestamptz,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid,timestamptz,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_revisar_ocorrencia(uuid,uuid,uuid,date,time,time,boolean,uuid,text,time,time,integer,boolean,numeric,integer,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_salvar_config(uuid,uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.dp_convocacao_exige_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_convocacao_log_evento(uuid,uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'dp_convocacao_salvar_config';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ASSINATURA_DUPLICADA: dp_convocacao_salvar_config possui % assinaturas', v_n;
  END IF;
END $$;