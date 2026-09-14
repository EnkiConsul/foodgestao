-- ============================================================================
-- Fase 5 — operações críticas: trocas, férias, convocações e escala
-- ============================================================================

-- ---------------------------------------------------------------- TROCAS ----
CREATE OR REPLACE FUNCTION public.dp_troca_propor(
  p_destino uuid,
  p_data_original date,
  p_data_proposta date,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_dest_company uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  IF p_destino IS NULL OR p_data_original IS NULL OR p_data_proposta IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o colega e as duas datas.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o motivo.' USING ERRCODE = '22023';
  END IF;
  IF p_destino = v_colab THEN
    RAISE EXCEPTION 'INVALID_INPUT: não é possível trocar com você mesmo.' USING ERRCODE = '22023';
  END IF;
  IF p_data_original = p_data_proposta THEN
    RAISE EXCEPTION 'INVALID_INPUT: as datas precisam ser diferentes.' USING ERRCODE = '22023';
  END IF;
  IF p_data_original < CURRENT_DATE OR p_data_proposta < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser trocadas.'
      USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company FROM public.dp_colaboradores WHERE id = v_colab;
  SELECT company_id INTO v_dest_company
    FROM public.dp_colaboradores
   WHERE id = p_destino AND deleted_at IS NULL AND ativo IS NOT false;
  IF v_dest_company IS NULL OR v_dest_company <> v_company THEN
    RAISE EXCEPTION 'FORBIDDEN: colega fora da sua empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|troca_dia|' || p_data_original::text || '|' || p_data_proposta::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab AND f.data = p_data_original AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_PROPRIA: você não tem folga na data que ofereceu.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dp_folgas f
     WHERE f.colaborador_id = p_destino AND f.data = p_data_proposta AND f.status <> 'cancelada'
  ) THEN
    RAISE EXCEPTION 'TROCA_SEM_FOLGA_COLEGA: o colega não tem folga na data pedida.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dp_trocas t
     WHERE t.solicitante_id = v_colab
       AND t.destino_id = p_destino
       AND t.data_original = p_data_original
       AND t.data_proposta = p_data_proposta
       AND t.status IN ('pendente_colega', 'pendente_gestor')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma troca pendente igual a esta.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_trocas(
    company_id, solicitante_id, destino_id, data_original, data_proposta,
    motivo, status, created_by)
  VALUES (v_company, v_colab, p_destino, p_data_original, p_data_proposta,
          v_motivo, 'pendente_colega', v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'troca_id', v_id, 'status', 'pendente_colega');
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_troca_responder_colega(
  p_id uuid,
  p_aceito boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  t public.dp_trocas%ROWTYPE;
  v_cfg public.dp_config_dp;
  v_unidade uuid;
  v_efetivada boolean := false;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a troca e a resposta.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR t.destino_id <> v_colab THEN
    RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF t.status <> 'pendente_colega' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta troca não está aguardando sua resposta.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_aceito THEN
    UPDATE public.dp_trocas
       SET colega_resposta = 'recusada',
           colega_respondido_em = now(),
           status = 'recusada',
           updated_at = now()
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'recusada',
                              'efetivada', false);
  END IF;

  UPDATE public.dp_trocas
     SET colega_resposta = 'aprovada',
         colega_respondido_em = now(),
         status = 'pendente_gestor',
         updated_at = now()
   WHERE id = t.id;
  v_status := 'pendente_gestor';

  SELECT unidade_id INTO v_unidade FROM public.dp_colaboradores WHERE id = t.destino_id;
  v_cfg := public.dp_config_resolvida(t.company_id, v_unidade);
  IF COALESCE(v_cfg.troca_folga_modo, 'aprovacao_admin') = 'direta' THEN
    PERFORM public.dp_processar_troca_direta(t.id);
    v_efetivada := true;
    v_status := 'aprovada';
  END IF;

  RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', v_status,
                            'efetivada', v_efetivada);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_troca_responder_gestor(
  p_id uuid,
  p_aceito boolean,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  t public.dp_trocas%ROWTYPE;
  v_obs text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL OR p_aceito IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a troca e a decisão.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, t.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF t.status <> 'pendente_gestor' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta troca não está aguardando decisão do gestor.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT p_aceito THEN
    UPDATE public.dp_trocas
       SET gestor_resposta = COALESCE('recusada: ' || v_obs, 'recusada'),
           gestor_respondido_em = now(),
           gestor_id = v_uid,
           status = 'recusada',
           updated_at = now()
     WHERE id = t.id;
    RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'recusada');
  END IF;

  UPDATE public.dp_trocas
     SET gestor_resposta = 'aprovada',
         gestor_respondido_em = now(),
         gestor_id = v_uid,
         updated_at = now()
   WHERE id = t.id;

  -- mesma transação: se a efetivação falhar, a aprovação não fica registrada
  PERFORM public.dp_processar_troca(t.id);

  RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'aprovada');
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_troca_cancelar_self(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  t public.dp_trocas%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|troca', 0));
  SELECT * INTO t FROM public.dp_trocas WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR t.solicitante_id <> v_colab THEN
    RAISE EXCEPTION 'FORBIDDEN: troca não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF t.status NOT IN ('pendente_colega', 'pendente_gestor') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: apenas trocas pendentes podem ser canceladas.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_trocas SET status = 'cancelada', updated_at = now() WHERE id = t.id;
  RETURN jsonb_build_object('ok', true, 'troca_id', t.id, 'status', 'cancelada');
END;
$$;

-- ---------------------------------------------------------------- FÉRIAS ----
CREATE OR REPLACE FUNCTION public.dp_ferias_gozo_editar(
  p_gozo_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_dias_abono integer DEFAULT 0,
  p_adiantar_13 boolean DEFAULT false,
  p_aviso_em date DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_justificativa text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  g public.dp_ferias_gozos%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_gozo_id IS NULL OR p_data_inicio IS NULL OR p_data_fim IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe o registro e as datas.' USING ERRCODE = '22023';
  END IF;
  IF p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO g FROM public.dp_ferias_gozos WHERE id = p_gozo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: registro de férias não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, g.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF g.status NOT IN ('planejado', 'aprovado') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: estas férias não podem mais ser editadas.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public.dp_ferias_validar_programacao(
    g.colaborador_id, g.periodo_id, p_data_inicio, p_data_fim,
    COALESCE(p_dias_abono, 0), NULLIF(btrim(COALESCE(p_justificativa, '')), ''), g.id);

  UPDATE public.dp_ferias_gozos
     SET data_inicio = p_data_inicio,
         data_fim = p_data_fim,
         dias = ((p_data_fim - p_data_inicio) + 1)::smallint,
         dias_abono = COALESCE(p_dias_abono, 0)::smallint,
         adiantar_13 = COALESCE(p_adiantar_13, false),
         aviso_em = p_aviso_em,
         observacao = NULLIF(btrim(COALESCE(p_observacao, '')), ''),
         aviso_justificativa = COALESCE(
           NULLIF(btrim(COALESCE(p_justificativa, '')), ''), aviso_justificativa),
         updated_at = now()
   WHERE id = g.id;

  RETURN jsonb_build_object('ok', true, 'gozo_id', g.id);
END;
$$;

-- ----------------------------------------------------------- CONVOCAÇÕES ----
CREATE OR REPLACE FUNCTION public.dp_convocacao_criar(
  p_colaborador uuid,
  p_data date,
  p_entrada time without time zone,
  p_saida time without time zone,
  p_intervalo_minutos integer DEFAULT 0,
  p_termina_no_dia_seguinte boolean DEFAULT false,
  p_carga_prevista_horas numeric DEFAULT 0,
  p_unidade uuid DEFAULT NULL,
  p_turno uuid DEFAULT NULL,
  p_prazo_resposta timestamptz DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade_colab uuid;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador IS NULL OR p_data IS NULL OR p_entrada IS NULL OR p_saida IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador, data e horário.' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_carga_prevista_horas, 0) <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT: o horário informado resulta em carga zero.'
      USING ERRCODE = '22023';
  END IF;
  IF p_prazo_resposta IS NOT NULL AND p_prazo_resposta <= now() THEN
    RAISE EXCEPTION 'INVALID_INPUT: o prazo de resposta precisa ser no futuro.'
      USING ERRCODE = '22023';
  END IF;

  SELECT company_id, unidade_id INTO v_company, v_unidade_colab
    FROM public.dp_colaboradores
   WHERE id = p_colaborador AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF p_unidade IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.dp_unidades u WHERE u.id = p_unidade AND u.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: unidade fora da empresa.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_colaborador::text || '|convocacao|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.colaborador_id = p_colaborador
       AND c.data = p_data
       AND c.status IN ('pendente', 'aceita')
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe convocação ativa deste colaborador nesta data.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.dp_convocacoes(
    company_id, colaborador_id, unidade_id, turno_id, data,
    entrada, saida, intervalo_minutos, termina_no_dia_seguinte, carga_prevista_horas,
    prazo_resposta, observacao, criada_por)
  VALUES (v_company, p_colaborador, COALESCE(p_unidade, v_unidade_colab), p_turno, p_data,
          p_entrada, p_saida, COALESCE(p_intervalo_minutos, 0),
          COALESCE(p_termina_no_dia_seguinte, false), p_carga_prevista_horas,
          p_prazo_resposta, NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'convocacao_id', v_id, 'status', 'pendente');
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_convocacao_cancelar(
  p_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  c public.dp_convocacoes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a convocação.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text || '|convocacao', 0));
  SELECT * INTO c FROM public.dp_convocacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: convocação não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, c.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;
  IF c.ocorrencia_id IS NOT NULL THEN
    RAISE EXCEPTION 'CONVOCACAO_FLUXO_NOVO: use o painel de convocações para cancelar esta oferta.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF c.status = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'convocacao_id', c.id, 'status', 'cancelada',
                              'ja_cancelada', true);
  END IF;
  IF c.status NOT IN ('pendente', 'aceita') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: esta convocação não pode ser cancelada.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_convocacoes
     SET status = 'cancelada',
         encerrada_em = COALESCE(encerrada_em, now()),
         encerramento_motivo = COALESCE(
           NULLIF(btrim(COALESCE(p_motivo, '')), ''), encerramento_motivo),
         updated_at = now()
   WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'convocacao_id', c.id, 'status', 'cancelada',
                            'ja_cancelada', false);
END;
$$;

-- a resposta do colaborador passa a existir somente via rotina própria
DROP POLICY IF EXISTS dp_convocacoes_respond_self ON public.dp_convocacoes;

-- ---------------------------------------------------------------- ESCALA ----
CREATE OR REPLACE FUNCTION public.dp_escala_publicar(
  p_competencia text DEFAULT NULL,
  p_unidade_id uuid DEFAULT NULL,
  p_escala_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_comp text := NULLIF(btrim(COALESCE(p_competencia, '')), '');
  v_unidade uuid := p_unidade_id;
  e public.dp_escalas%ROWTYPE;
  v_itens int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;

  IF p_escala_id IS NOT NULL THEN
    SELECT company_id INTO v_company FROM public.dp_escalas WHERE id = p_escala_id;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: escala não encontrada.' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_comp IS NULL OR v_unidade IS NULL THEN
      RAISE EXCEPTION 'INVALID_INPUT: informe a unidade e a competência.' USING ERRCODE = '22023';
    END IF;
    SELECT company_id INTO v_company FROM public.dp_unidades WHERE id = v_unidade;
    IF v_company IS NULL THEN
      RAISE EXCEPTION 'FORBIDDEN: unidade não encontrada.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT private.is_company_admin_or_owner(v_uid, v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_company::text || '|escala|' || COALESCE(v_unidade::text, 'sem') || '|'
      || COALESCE(v_comp, p_escala_id::text), 0));

  IF p_escala_id IS NOT NULL THEN
    SELECT * INTO e FROM public.dp_escalas WHERE id = p_escala_id FOR UPDATE;
  ELSE
    SELECT * INTO e
      FROM public.dp_escalas
     WHERE company_id = v_company
       AND competencia = v_comp
       AND unidade_id IS NOT DISTINCT FROM v_unidade
     ORDER BY created_at
     LIMIT 1
     FOR UPDATE;
  END IF;

  IF e.id IS NULL THEN
    RAISE EXCEPTION 'ESCALA_NAO_ENCONTRADA: gere a escala antes de publicar.'
      USING ERRCODE = '22023';
  END IF;

  IF e.status = 'publicada' THEN
    RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'status', 'publicada',
                              'ja_publicada', true,
                              'publicada_em', e.publicada_em, 'publicada_por', e.publicada_por);
  END IF;

  SELECT count(*) INTO v_itens FROM public.dp_escala_itens i WHERE i.escala_id = e.id;
  IF COALESCE(v_itens, 0) = 0 THEN
    RAISE EXCEPTION 'ESCALA_VAZIA: não há dias na escala para publicar.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.dp_escalas
     SET status = 'publicada',
         publicada_em = now(),
         publicada_por = v_uid,
         updated_at = now()
   WHERE id = e.id;

  RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'status', 'publicada',
                            'ja_publicada', false, 'itens', v_itens);
END;
$$;

CREATE OR REPLACE FUNCTION public.dp_escala_reabrir(p_escala_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  e public.dp_escalas%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_escala_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a escala.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_escala_id::text || '|escala_row', 0));
  SELECT * INTO e FROM public.dp_escalas WHERE id = p_escala_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FORBIDDEN: escala não encontrada.' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_admin_or_owner(v_uid, e.company_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: acesso restrito a administradores da empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF e.status <> 'publicada' THEN
    RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'status', e.status::text,
                              'ja_rascunho', true);
  END IF;

  UPDATE public.dp_escalas
     SET status = 'rascunho', publicada_em = NULL, publicada_por = NULL, updated_at = now()
   WHERE id = e.id;

  RETURN jsonb_build_object('ok', true, 'escala_id', e.id, 'status', 'rascunho',
                            'ja_rascunho', false);
END;
$$;

-- ------------------------------------------------------------ PERMISSÕES ----
DO $grants$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND (p.proname LIKE '%troca%' OR p.proname LIKE '%ferias%'
            OR p.proname LIKE '%convocac%' OR p.proname LIKE '%escala%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $grants$;

-- rotinas internas (gatilhos e trabalhos do servidor) não precisam de sessão
REVOKE ALL ON FUNCTION public.dp_processar_troca(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.dp_processar_troca_direta(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_processar_troca_direta(uuid) TO service_role;