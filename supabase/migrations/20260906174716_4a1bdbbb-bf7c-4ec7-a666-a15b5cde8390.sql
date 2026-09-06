-- 1) Destinatários: caminho idempotente sem bump de versão do grupo
CREATE OR REPLACE FUNCTION public.dp_convocacao_definir_destinatarios(p_grupo_id uuid, p_colaboradores uuid[], p_expected_updated_at timestamp with time zone, p_niveis jsonb DEFAULT NULL::jsonb, p_intervalo_niveis_horas integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_grupo public.dp_convocacao_grupos;
  v_ids uuid[];
  v_ativos jsonb;
  v_igual boolean;
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
  v_uid := public.dp_convocacao_exige_admin(v_company);

  SELECT * INTO v_grupo
    FROM public.dp_convocacao_grupos
   WHERE id = p_grupo_id AND company_id = v_company
   FOR UPDATE;

  IF v_grupo.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente rascunhos aceitam mudança de destinatários.' USING ERRCODE = '22023';
  END IF;

  IF p_intervalo_niveis_horas IS NOT NULL
     AND (p_intervalo_niveis_horas < 1 OR p_intervalo_niveis_horas > 168) THEN
    RAISE EXCEPTION 'INVALID_INPUT: o intervalo entre níveis deve ficar entre 1 e 168 horas.' USING ERRCODE = '22023';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(COALESCE(p_colaboradores, '{}'::uuid[])) AS x WHERE x IS NOT NULL)
    INTO v_ids;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
        WHERE c.id = t.id AND c.company_id = v_company
          AND c.ativo IS NOT FALSE
          AND public.dp_regime_convocavel(c.regime)
          AND c.unidade_id IS NOT NULL
          AND c.unidade_id = v_grupo.unidade_id)
  ) THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT: há pessoa fora da empresa, inativa, de outra unidade ou sem vínculo convocável.'
      USING ERRCODE = '22023';
  END IF;

  IF p_niveis IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_niveis) AS t(x)
     WHERE COALESCE((x->>'nivel')::int, 1) < 1 OR COALESCE((x->>'nivel')::int, 1) > 9
        OR NOT ((x->>'colaborador_id')::uuid = ANY (v_ids))
  ) THEN
    RAISE EXCEPTION 'INVALID_INPUT: nível de prioridade inválido ou de pessoa não selecionada.' USING ERRCODE = '22023';
  END IF;

  -- Nada a fazer? Devolve a versão atual sem tocar no grupo (evita falso conflito).
  SELECT COALESCE(v_grupo.publico_modo, '') = 'selecionado'
     AND COALESCE(v_grupo.intervalo_niveis_horas, -1)
         = COALESCE(p_intervalo_niveis_horas, v_grupo.intervalo_niveis_horas, -1)
     AND NOT EXISTS (
       SELECT 1 FROM public.dp_convocacao_destinatarios d
        WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
          AND d.removido_em IS NULL
          AND NOT (d.colaborador_id = ANY (v_ids)))
     AND NOT EXISTS (
       SELECT 1 FROM unnest(v_ids) AS t(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.dp_convocacao_destinatarios d
           WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
             AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
             AND d.colaborador_id = t.id))
     AND NOT EXISTS (
       SELECT 1
         FROM public.dp_convocacao_destinatarios d
         JOIN (
           SELECT (x->>'colaborador_id')::uuid AS colaborador_id,
                  COALESCE((x->>'nivel')::int, 1) AS nivel
             FROM jsonb_array_elements(COALESCE(p_niveis, '[]'::jsonb)) AS e(x)
         ) n ON n.colaborador_id = d.colaborador_id
        WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
          AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
          AND d.nivel <> n.nivel)
    INTO v_igual;

  IF COALESCE(v_igual, false) THEN
    SELECT COALESCE(jsonb_agg(d.colaborador_id ORDER BY d.colaborador_id), '[]'::jsonb)
      INTO v_ativos
      FROM public.dp_convocacao_destinatarios d
     WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
       AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL;

    RETURN jsonb_build_object(
      'grupo_id', v_grupo.id,
      'updated_at', v_grupo.updated_at,
      'publico_modo', v_grupo.publico_modo,
      'intervalo_niveis_horas', v_grupo.intervalo_niveis_horas,
      'destinatarios', v_ativos,
      'idempotente', true);
  END IF;

  IF p_expected_updated_at IS NULL OR v_grupo.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: o grupo foi alterado por outra pessoa.' USING ERRCODE = '40001';
  END IF;

  -- soft remove do que saiu (global e overrides do grupo)
  UPDATE public.dp_convocacao_destinatarios d
     SET removido_em = now(), removido_por = v_uid
   WHERE d.grupo_id = v_grupo.id
     AND d.company_id = v_company
     AND d.removido_em IS NULL
     AND NOT (d.colaborador_id = ANY (v_ids));

  -- insere o que entrou; mantém iguais
  INSERT INTO public.dp_convocacao_destinatarios(
    company_id, grupo_id, ocorrencia_id, colaborador_id, created_by, nivel)
  SELECT v_company, v_grupo.id, NULL, t.id, v_uid,
         COALESCE((SELECT (x->>'nivel')::int
                     FROM jsonb_array_elements(COALESCE(p_niveis, '[]'::jsonb)) AS e(x)
                    WHERE (x->>'colaborador_id')::uuid = t.id
                    LIMIT 1), 1)
    FROM unnest(v_ids) AS t(id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.dp_convocacao_destinatarios d
      WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
        AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
        AND d.colaborador_id = t.id);

  -- atualiza o nível de quem já estava selecionado
  UPDATE public.dp_convocacao_destinatarios d
     SET nivel = n.nivel, updated_at = now()
    FROM (
      SELECT (x->>'colaborador_id')::uuid AS colaborador_id,
             COALESCE((x->>'nivel')::int, 1) AS nivel
        FROM jsonb_array_elements(COALESCE(p_niveis, '[]'::jsonb)) AS e(x)
    ) n
   WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
     AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL
     AND d.colaborador_id = n.colaborador_id
     AND d.nivel <> n.nivel;

  UPDATE public.dp_convocacao_grupos
     SET publico_modo = 'selecionado',
         intervalo_niveis_horas = COALESCE(p_intervalo_niveis_horas, intervalo_niveis_horas),
         updated_at = now()
   WHERE id = v_grupo.id AND company_id = v_company
  RETURNING * INTO v_grupo;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_grupo.id, NULL, 'destinatarios_definidos',
    jsonb_build_object('quantidade', COALESCE(array_length(v_ids, 1), 0),
                       'intervalo_niveis_horas', v_grupo.intervalo_niveis_horas));

  SELECT COALESCE(jsonb_agg(d.colaborador_id ORDER BY d.colaborador_id), '[]'::jsonb)
    INTO v_ativos
    FROM public.dp_convocacao_destinatarios d
   WHERE d.grupo_id = v_grupo.id AND d.company_id = v_company
     AND d.ocorrencia_id IS NULL AND d.removido_em IS NULL;

  RETURN jsonb_build_object(
    'grupo_id', v_grupo.id,
    'updated_at', v_grupo.updated_at,
    'publico_modo', v_grupo.publico_modo,
    'intervalo_niveis_horas', v_grupo.intervalo_niveis_horas,
    'destinatarios', v_ativos,
    'idempotente', false);
END;
$function$;

-- 2) Ocorrências: devolver também a versão atual do grupo
CREATE OR REPLACE FUNCTION public.dp_convocacao_atualizar_ocorrencia(p_ocorrencia_id uuid, p_expected_updated_at timestamp with time zone, p_cargo_id uuid, p_data date, p_necessidade_entrada time without time zone, p_necessidade_saida time without time zone, p_necessidade_termina_no_dia_seguinte boolean DEFAULT false, p_turno_referencia_id uuid DEFAULT NULL::uuid, p_horario_modo text DEFAULT 'horario_unico'::text, p_entrada time without time zone DEFAULT NULL::time without time zone, p_saida time without time zone DEFAULT NULL::time without time zone, p_intervalo_minutos integer DEFAULT NULL::integer, p_termina_no_dia_seguinte boolean DEFAULT NULL::boolean, p_carga_prevista_horas numeric DEFAULT NULL::numeric, p_vagas integer DEFAULT 1, p_condicoes_comuns jsonb DEFAULT '{}'::jsonb, p_colaborador_alvo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
  v_grupo_updated timestamptz;
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
    'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
    'colaborador_alvo_id', v_row.colaborador_alvo_id);

  v_desejado := jsonb_build_object(
    'cargo_id', p_cargo_id, 'data', p_data,
    'necessidade_entrada', p_necessidade_entrada, 'necessidade_saida', p_necessidade_saida,
    'necessidade_termina_no_dia_seguinte', COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    'turno_referencia_id', p_turno_referencia_id, 'horario_modo', p_horario_modo,
    'entrada', p_entrada, 'saida', p_saida, 'intervalo_minutos', p_intervalo_minutos,
    'termina_no_dia_seguinte', p_termina_no_dia_seguinte, 'carga_prevista_horas', p_carga_prevista_horas,
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb),
    'colaborador_alvo_id', p_colaborador_alvo_id);

  SELECT g.updated_at INTO v_grupo_updated
    FROM public.dp_convocacao_grupos g
   WHERE g.id = v_row.grupo_id AND g.company_id = v_company;

  IF v_atual = v_desejado THEN
    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
      'updated_at', v_row.updated_at, 'grupo_updated_at', v_grupo_updated,
      'alterado', false, 'idempotente', true);
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
         colaborador_alvo_id = p_colaborador_alvo_id,
         updated_at = now()
   WHERE id = p_ocorrencia_id
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_atualizada',
    jsonb_build_object('de', v_atual, 'para', v_desejado));

  SELECT g.updated_at INTO v_grupo_updated
    FROM public.dp_convocacao_grupos g
   WHERE g.id = v_row.grupo_id AND g.company_id = v_company;

  RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'status', v_row.status,
    'updated_at', v_row.updated_at, 'grupo_updated_at', v_grupo_updated,
    'alterado', true, 'idempotente', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_cancelar_ocorrencia_rascunho(p_ocorrencia_id uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_row public.dp_convocacao_ocorrencias;
  v_grupo_status text;
  v_grupo_updated timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: autenticação obrigatória.' USING ERRCODE = '42501';
  END IF;

  IF p_ocorrencia_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificador da necessidade é obrigatório.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company
    FROM public.dp_convocacao_ocorrencias
   WHERE id = p_ocorrencia_id;

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

  SELECT status, updated_at INTO v_grupo_status, v_grupo_updated
    FROM public.dp_convocacao_grupos
   WHERE id = v_row.grupo_id AND company_id = v_company;

  IF v_grupo_status IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: grupo da necessidade inexistente.' USING ERRCODE = '23503';
  END IF;

  IF v_row.status = 'cancelada' THEN
    RETURN jsonb_build_object(
      'ocorrencia_id', v_row.id,
      'status', v_row.status,
      'updated_at', v_row.updated_at,
      'grupo_updated_at', v_grupo_updated,
      'alterado', false,
      'idempotente', true);
  END IF;

  IF v_row.status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: somente necessidades em rascunho podem ser retiradas.' USING ERRCODE = '22023';
  END IF;

  IF v_grupo_status <> 'rascunho' THEN
    RAISE EXCEPTION 'INVALID_STATE: o grupo não está mais em rascunho.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_row.updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'CONCURRENT_MODIFICATION: a necessidade foi alterada por outra pessoa. Recarregue e tente novamente.' USING ERRCODE = '40001';
  END IF;

  UPDATE public.dp_convocacao_ocorrencias
     SET status = 'cancelada',
         updated_at = now()
   WHERE id = v_row.id AND company_id = v_company
  RETURNING * INTO v_row;

  PERFORM public.dp_convocacao_log_evento(
    v_company, v_row.grupo_id, v_row.id, 'ocorrencia_cancelada',
    jsonb_build_object('de_status', 'rascunho', 'para_status', 'cancelada', 'motivo', 'retirada_do_rascunho'));

  SELECT updated_at INTO v_grupo_updated
    FROM public.dp_convocacao_grupos
   WHERE id = v_row.grupo_id AND company_id = v_company;

  RETURN jsonb_build_object(
    'ocorrencia_id', v_row.id,
    'status', v_row.status,
    'updated_at', v_row.updated_at,
    'grupo_updated_at', v_grupo_updated,
    'alterado', true,
    'idempotente', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_criar_ocorrencia(p_ocorrencia_id uuid, p_grupo_id uuid, p_cargo_id uuid, p_data date, p_necessidade_entrada time without time zone, p_necessidade_saida time without time zone, p_necessidade_termina_no_dia_seguinte boolean DEFAULT false, p_turno_referencia_id uuid DEFAULT NULL::uuid, p_horario_modo text DEFAULT 'horario_unico'::text, p_entrada time without time zone DEFAULT NULL::time without time zone, p_saida time without time zone DEFAULT NULL::time without time zone, p_intervalo_minutos integer DEFAULT NULL::integer, p_termina_no_dia_seguinte boolean DEFAULT NULL::boolean, p_carga_prevista_horas numeric DEFAULT NULL::numeric, p_vagas integer DEFAULT 1, p_condicoes_comuns jsonb DEFAULT '{}'::jsonb, p_colaborador_alvo_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_grupo public.dp_convocacao_grupos;
  v_row public.dp_convocacao_ocorrencias;
  v_atual jsonb;
  v_desejado jsonb;
  v_grupo_updated timestamptz;
BEGIN
  IF p_ocorrencia_id IS NULL OR p_grupo_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: identificadores da ocorrência e do grupo são obrigatórios.' USING ERRCODE = '22023';
  END IF;

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
    'vagas', COALESCE(p_vagas, 1), 'condicoes_comuns', COALESCE(p_condicoes_comuns, '{}'::jsonb),
    'colaborador_alvo_id', p_colaborador_alvo_id);

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
      'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
      'colaborador_alvo_id', v_row.colaborador_alvo_id);
    IF v_atual = v_desejado THEN
      SELECT g.updated_at INTO v_grupo_updated FROM public.dp_convocacao_grupos g WHERE g.id = v_row.grupo_id;
      RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
        'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
        'status', v_row.status, 'updated_at', v_row.updated_at,
        'grupo_updated_at', v_grupo_updated, 'idempotente', true);
    END IF;
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.dp_convocacao_ocorrencias WHERE id = p_ocorrencia_id) THEN
    RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador em outro contexto.' USING ERRCODE = '23505';
  END IF;

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
    termina_no_dia_seguinte, carga_prevista_horas, vagas, condicoes_comuns,
    colaborador_alvo_id, status, criado_por)
  VALUES (
    p_ocorrencia_id, v_grupo.company_id, v_grupo.id, v_grupo.unidade_id, p_cargo_id, p_data,
    p_necessidade_entrada, p_necessidade_saida, COALESCE(p_necessidade_termina_no_dia_seguinte, false),
    p_turno_referencia_id, p_horario_modo, p_entrada, p_saida, p_intervalo_minutos,
    p_termina_no_dia_seguinte, p_carga_prevista_horas, COALESCE(p_vagas, 1),
    COALESCE(p_condicoes_comuns, '{}'::jsonb), p_colaborador_alvo_id, 'rascunho', v_uid)
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND AND v_row.id IS NOT NULL THEN
    PERFORM public.dp_convocacao_log_evento(v_row.company_id, v_row.grupo_id, v_row.id, 'ocorrencia_criada',
      jsonb_build_object('data', v_row.data, 'cargo_id', v_row.cargo_id, 'vagas', v_row.vagas,
                         'colaborador_alvo_id', v_row.colaborador_alvo_id));

    SELECT g.updated_at INTO v_grupo_updated FROM public.dp_convocacao_grupos g WHERE g.id = v_row.grupo_id;

    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
      'status', v_row.status, 'updated_at', v_row.updated_at,
      'grupo_updated_at', v_grupo_updated, 'idempotente', false);
  END IF;

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
    'vagas', v_row.vagas, 'condicoes_comuns', v_row.condicoes_comuns,
    'colaborador_alvo_id', v_row.colaborador_alvo_id);

  IF v_atual = v_desejado THEN
    SELECT g.updated_at INTO v_grupo_updated FROM public.dp_convocacao_grupos g WHERE g.id = v_row.grupo_id;
    RETURN jsonb_build_object('ocorrencia_id', v_row.id, 'grupo_id', v_row.grupo_id,
      'company_id', v_row.company_id, 'unidade_id', v_row.unidade_id, 'versao', v_row.versao,
      'status', v_row.status, 'updated_at', v_row.updated_at,
      'grupo_updated_at', v_grupo_updated, 'idempotente', true);
  END IF;

  RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: já existe uma necessidade com este identificador e conteúdo diferente.' USING ERRCODE = '23505';
END;
$function$;