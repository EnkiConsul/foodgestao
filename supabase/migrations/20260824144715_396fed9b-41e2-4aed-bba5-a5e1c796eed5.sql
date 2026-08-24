-- ============================================================
-- M25 — Hardening do Bloco 4 (folgas, cobertura e indisponibilidade)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Jornada prevista do dia (trabalha? qual turno?)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_jornada_dia_prevista(
  p_colaborador uuid,
  p_data date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wd int := EXTRACT(DOW FROM p_data)::int;
  v_tipo public.dp_escala_item_tipo;
  v_item_turno uuid;
  v_cfg_id uuid;
  v_turno_padrao uuid;
  v_trabalha boolean;
  v_dia_turno uuid;
  v_tem_dia boolean := false;
BEGIN
  IF p_colaborador IS NULL OR p_data IS NULL THEN
    RETURN jsonb_build_object('trabalha', false, 'turno_id', NULL, 'fonte', 'invalido');
  END IF;

  SELECT i.tipo, i.turno_id
    INTO v_tipo, v_item_turno
    FROM public.dp_escala_itens i
    JOIN public.dp_escalas e ON e.id = i.escala_id
   WHERE i.colaborador_id = p_colaborador
     AND i.data = p_data
     AND e.status = 'publicada'
   ORDER BY i.updated_at DESC NULLS LAST
   LIMIT 1;

  IF v_tipo IS NOT NULL THEN
    RETURN jsonb_build_object(
      'trabalha', v_tipo = 'trabalho',
      'turno_id', v_item_turno,
      'fonte', 'escala_publicada');
  END IF;

  SELECT ct.id, ct.turno_padrao_id
    INTO v_cfg_id, v_turno_padrao
    FROM public.dp_colaborador_config_trabalho ct
   WHERE ct.colaborador_id = p_colaborador
     AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
   ORDER BY ct.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NULL THEN
    -- sem configuração vigente: assume equipe habitual do dia (fail open)
    RETURN jsonb_build_object('trabalha', true, 'turno_id', NULL, 'fonte', 'sem_configuracao');
  END IF;

  SELECT d.trabalha, d.turno_id, true
    INTO v_trabalha, v_dia_turno, v_tem_dia
    FROM public.dp_colaborador_config_dias d
   WHERE d.config_id = v_cfg_id
     AND d.dow = v_wd
   LIMIT 1;

  IF NOT COALESCE(v_tem_dia, false) THEN
    RETURN jsonb_build_object(
      'trabalha', true, 'turno_id', v_turno_padrao, 'fonte', 'sem_dia_configurado');
  END IF;

  RETURN jsonb_build_object(
    'trabalha', COALESCE(v_trabalha, false),
    'turno_id', COALESCE(v_dia_turno, v_turno_padrao),
    'fonte', 'config_dias');
END;
$$;

REVOKE ALL ON FUNCTION public.dp_jornada_dia_prevista(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_jornada_dia_prevista(uuid, date)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. Capacidade habitual por dia/cargo/TURNO
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.dp_capacidade_habitual_dia_cargo(
  p_company uuid,
  p_unidade uuid,
  p_cargo uuid,
  p_data date,
  p_ignorar_colaborador uuid DEFAULT NULL,
  p_turno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_minimo int;
  v_wd int;
  v_considerar_ind boolean;
  v_base int := 0;
  v_folgas int := 0;
  v_ind int := 0;
  v_ignorar_conta boolean := false;
  v_cap int := 0;
  v_cap_apos int := 0;
BEGIN
  IF p_company IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e data são obrigatórias.' USING ERRCODE = '22023';
  END IF;

  IF v_uid IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = p_company AND m.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.companies c
                      WHERE c.id = p_company AND c.owner_id = v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: empresa fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  v_wd := EXTRACT(DOW FROM p_data)::int;

  -- mínimo: regra mais específica; turno específico só quando o turno é conhecido
  SELECT cm.minimo INTO v_minimo
    FROM public.dp_cobertura_minima cm
   WHERE cm.company_id = p_company
     AND cm.ativo = true
     AND (cm.unidade_id IS NULL OR cm.unidade_id = p_unidade)
     AND (cm.cargo_id IS NULL OR cm.cargo_id = p_cargo)
     AND (cm.dia_semana IS NULL OR cm.dia_semana = v_wd)
     AND (cm.turno_id IS NULL OR cm.turno_id = p_turno_id)
     AND (cm.vigencia_inicio IS NULL OR cm.vigencia_inicio <= p_data)
     AND (cm.vigencia_fim IS NULL OR cm.vigencia_fim >= p_data)
   ORDER BY (cm.turno_id IS NOT NULL) DESC,
            (cm.unidade_id IS NOT NULL) DESC,
            (cm.cargo_id IS NOT NULL) DESC,
            (cm.dia_semana IS NOT NULL) DESC,
            cm.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  SELECT COALESCE(considerar_indisponibilidade_cobertura, true)
    INTO v_considerar_ind
    FROM public.dp_config_dp WHERE company_id = p_company;
  v_considerar_ind := COALESCE(v_considerar_ind, true);

  WITH equipe AS (
    SELECT c.id, c.regime
      FROM public.dp_colaboradores c
     WHERE c.company_id = p_company
       AND c.ativo = true
       AND c.deleted_at IS NULL
       AND (p_unidade IS NULL OR c.unidade_id = p_unidade)
       AND (p_cargo IS NULL OR c.cargo_id = p_cargo)
       AND (
         NOT COALESCE(public.dp_regime_convocavel(c.regime), false)
         OR COALESCE((
           SELECT ct.compoe_equipe_habitual
             FROM public.dp_colaborador_config_trabalho ct
            WHERE ct.colaborador_id = c.id
              AND (ct.vigencia_inicio IS NULL OR ct.vigencia_inicio <= p_data)
              AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= p_data)
            ORDER BY ct.vigencia_inicio DESC NULLS LAST
            LIMIT 1), true)
       )
  ),
  prev AS (
    SELECT e.id, e.regime,
           COALESCE((j.j->>'trabalha')::boolean, false) AS trabalha,
           NULLIF(j.j->>'turno_id', '')::uuid AS turno_id
      FROM equipe e
      CROSS JOIN LATERAL (
        SELECT public.dp_jornada_dia_prevista(e.id, p_data) AS j
      ) j
  ),
  elig AS (
    SELECT * FROM prev
     WHERE trabalha
       AND (p_turno_id IS NULL OR turno_id IS NULL OR turno_id = p_turno_id)
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = el.id AND f.data = p_data
         AND f.status <> 'cancelada' AND f.extra = false)),
    count(*) FILTER (WHERE
      v_considerar_ind
      AND COALESCE(public.dp_regime_convocavel(el.regime), false)
      AND EXISTS (
        SELECT 1 FROM public.dp_indisponibilidades i
         WHERE i.colaborador_id = el.id AND i.data = p_data
           AND i.cancelada_em IS NULL)),
    bool_or(
      p_ignorar_colaborador IS NOT NULL
      AND el.id = p_ignorar_colaborador
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_folgas f
         WHERE f.colaborador_id = el.id AND f.data = p_data
           AND f.status <> 'cancelada' AND f.extra = false)
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_indisponibilidades i
         WHERE v_considerar_ind AND i.colaborador_id = el.id
           AND i.data = p_data AND i.cancelada_em IS NULL))
    INTO v_base, v_folgas, v_ind, v_ignorar_conta
    FROM elig el;

  v_cap := GREATEST(COALESCE(v_base, 0) - COALESCE(v_folgas, 0) - COALESCE(v_ind, 0), 0);
  v_cap_apos := v_cap;
  IF COALESCE(v_ignorar_conta, false) THEN
    v_cap_apos := GREATEST(v_cap - 1, 0);
  END IF;

  RETURN jsonb_build_object(
    'minimo', v_minimo,
    'turno_id', p_turno_id,
    'capacidade_habitual', v_cap,
    'indisponiveis_habituais', COALESCE(v_ind, 0),
    'folgas', COALESCE(v_folgas, 0),
    'capacidade_apos_acao', v_cap_apos,
    'deficit', CASE WHEN v_minimo IS NULL THEN 0
                    ELSE GREATEST(v_minimo - v_cap_apos, 0) END);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid, uuid)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3. Trigger de autoatendimento: agora com turno
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_cobertura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade uuid;
  v_cargo uuid;
  v_turno uuid;
  v_res jsonb;
BEGIN
  IF NEW.status = 'cancelada' OR NEW.extra = true
     OR NEW.tipo IN ('ferias', 'licenca')
     OR NEW.origem <> 'solicitacao'::public.dp_folga_origem THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, cargo_id INTO v_unidade, v_cargo
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  v_turno := NULLIF(
    public.dp_jornada_dia_prevista(NEW.colaborador_id, NEW.data)->>'turno_id', '')::uuid;

  v_res := public.dp_capacidade_habitual_dia_cargo(
    NEW.company_id, v_unidade, v_cargo, NEW.data, NEW.colaborador_id, v_turno);

  IF (v_res->>'minimo') IS NOT NULL AND COALESCE((v_res->>'deficit')::int, 0) > 0 THEN
    RAISE EXCEPTION 'Não é possível liberar esta folga porque a equipe ficaria abaixo da cobertura mínima definida para este dia.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_folgas_validar_cobertura ON public.dp_folgas;
CREATE TRIGGER trg_dp_folgas_validar_cobertura
  BEFORE INSERT ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_folgas_validar_cobertura();

-- ------------------------------------------------------------
-- 4. RPC administrativa: substituição atômica + cancelamento lógico
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean);

CREATE OR REPLACE FUNCTION public.dp_folga_criar_admin(
  p_colaborador_id uuid,
  p_data date,
  p_tipo text DEFAULT 'normal',
  p_extra boolean DEFAULT false,
  p_observacao text DEFAULT NULL,
  p_confirmar_deficit boolean DEFAULT false,
  p_substituir_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_turno uuid;
  v_res jsonb;
  v_id uuid;
  v_deficit int;
  v_canceladas int := 0;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_colaborador_id IS NULL OR p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe colaborador e data.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, unidade_id, cargo_id INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores
   WHERE id = p_colaborador_id AND ativo = true AND deleted_at IS NULL;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: colaborador inexistente ou inativo.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem lançar folgas.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_colaborador_id::text || '|folga|' || p_data::text, 0));

  v_turno := NULLIF(
    public.dp_jornada_dia_prevista(p_colaborador_id, p_data)->>'turno_id', '')::uuid;

  v_res := public.dp_capacidade_habitual_dia_cargo(
    v_company, v_unidade, v_cargo, p_data, p_colaborador_id, v_turno);
  v_deficit := COALESCE((v_res->>'deficit')::int, 0);

  IF (v_res->>'minimo') IS NOT NULL AND v_deficit > 0 AND NOT COALESCE(p_confirmar_deficit, false) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'requer_confirmacao', true,
      'cobertura', v_res,
      'mensagem', 'Esta folga deixará a equipe abaixo da cobertura mínima. Deseja continuar mesmo assim?');
  END IF;

  -- substituição atômica: cancela (sem apagar) somente na mesma transação da criação
  IF p_substituir_ids IS NOT NULL AND array_length(p_substituir_ids, 1) > 0 THEN
    FOR r IN
      UPDATE public.dp_folgas f
         SET status = 'cancelada',
             observacao = btrim(concat_ws(' | ', NULLIF(f.observacao, ''),
               'Substituída por folga de ' || to_char(p_data, 'DD/MM/YYYY'))),
             updated_at = now()
       WHERE f.id = ANY(p_substituir_ids)
         AND f.company_id = v_company
         AND f.colaborador_id = p_colaborador_id
         AND f.status <> 'cancelada'
      RETURNING f.id, f.data
    LOOP
      v_canceladas := v_canceladas + 1;
      PERFORM public.insert_audit_log(
        'folga_cancelada_substituicao', 'dp_folgas', r.id::text,
        jsonb_build_object('company_id', v_company, 'colaborador_id', p_colaborador_id,
                           'data_cancelada', r.data, 'data_nova', p_data));
    END LOOP;
  END IF;

  INSERT INTO public.dp_folgas(
    company_id, colaborador_id, data, tipo, origem, status, extra, observacao, criado_por)
  VALUES (v_company, p_colaborador_id, p_data, p_tipo::public.dp_folga_tipo,
          'admin_manual', 'agendada', COALESCE(p_extra, false),
          NULLIF(btrim(COALESCE(p_observacao, '')), ''), v_uid)
  RETURNING id INTO v_id;

  IF (v_res->>'minimo') IS NOT NULL AND v_deficit > 0 THEN
    PERFORM public.insert_audit_log(
      'folga_cobertura_override', 'dp_folgas', v_id::text,
      jsonb_build_object(
        'company_id', v_company, 'unidade_id', v_unidade, 'cargo_id', v_cargo,
        'turno_id', v_turno, 'data', p_data, 'minimo', (v_res->>'minimo')::int,
        'capacidade_prevista', (v_res->>'capacidade_apos_acao')::int,
        'deficit', v_deficit, 'confirmado', true));
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'folga_id', v_id, 'canceladas', v_canceladas, 'cobertura', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[])
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5. Cancelamento lógico de folga pelo administrador
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_cancelar_admin(
  p_folga_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_colab uuid;
  v_data date;
  v_status public.dp_folga_status;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_folga_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a folga.' USING ERRCODE = '22023';
  END IF;

  SELECT company_id, colaborador_id, data, status
    INTO v_company, v_colab, v_data, v_status
    FROM public.dp_folgas WHERE id = p_folga_id
    FOR UPDATE;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: folga inexistente.' USING ERRCODE = '23503';
  END IF;

  IF NOT private.is_company_admin_or_owner(v_company) THEN
    RAISE EXCEPTION 'FORBIDDEN: apenas responsáveis da empresa podem cancelar folgas.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'folga_id', p_folga_id, 'idempotente', true);
  END IF;

  UPDATE public.dp_folgas
     SET status = 'cancelada',
         observacao = btrim(concat_ws(' | ', NULLIF(observacao, ''),
           COALESCE('Cancelada pelo DP: ' || v_motivo, 'Cancelada pelo DP'))),
         updated_at = now()
   WHERE id = p_folga_id;

  PERFORM public.insert_audit_log(
    'folga_cancelada_admin', 'dp_folgas', p_folga_id::text,
    jsonb_build_object('company_id', v_company, 'colaborador_id', v_colab,
                       'data', v_data, 'motivo', v_motivo));

  RETURN jsonb_build_object('ok', true, 'folga_id', p_folga_id, 'idempotente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_cancelar_admin(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_cancelar_admin(uuid, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6. Solicitação de folga pelo portal, validando cobertura antes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_folga_solicitar(
  p_data date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_company uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_turno uuid;
  v_res jsonb;
  v_id uuid;
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.cargo_id
    INTO v_company, v_unidade, v_cargo
    FROM public.dp_colaboradores c WHERE c.id = v_colab;

  IF p_data < CURRENT_DATE THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser solicitadas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab::text || '|solic_folga|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_solicitacoes s
     WHERE s.colaborador_id = v_colab AND s.tipo = 'folga'
       AND s.data_alvo = p_data AND s.status = 'pendente'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: já existe uma solicitação pendente para este dia.'
      USING ERRCODE = '22023';
  END IF;

  v_turno := NULLIF(
    public.dp_jornada_dia_prevista(v_colab, p_data)->>'turno_id', '')::uuid;

  v_res := public.dp_capacidade_habitual_dia_cargo(
    v_company, v_unidade, v_cargo, p_data, v_colab, v_turno);

  IF (v_res->>'minimo') IS NOT NULL AND COALESCE((v_res->>'deficit')::int, 0) > 0 THEN
    RAISE EXCEPTION 'COVERAGE_MINIMUM: a equipe ficaria abaixo da cobertura mínima neste dia.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, motivo, status)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data, v_motivo, 'pendente')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'solicitacao_id', v_id, 'cobertura', v_res);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_solicitar(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text)
  TO authenticated, service_role;

-- ------------------------------------------------------------
-- 7. Indisponibilidade: respeitar precedência temporal do encerramento
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dp_indisponibilidade_marcar(
  p_data date,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_colab_id uuid;
  v_company uuid;
  v_unidade uuid;
  v_regime public.dp_regime_trabalho;
  v_tz text;
  v_hoje date;
  v_agora timestamptz := now();
  v_motivo text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_existente uuid;
  v_id uuid;
  v_encerradas int := 0;
  v_temporais int := 0;
  v_enc text;
  v_status public.dp_convocacao_status;
  v_mot text;
  v_evento text;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED: sessão ausente.' USING ERRCODE = '28000';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: informe a data.' USING ERRCODE = '22023';
  END IF;

  v_colab_id := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: cadastro de colaborador não encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT c.company_id, c.unidade_id, c.regime
    INTO v_company, v_unidade, v_regime
    FROM public.dp_colaboradores c
   WHERE c.id = v_colab_id;

  IF NOT COALESCE(public.dp_regime_convocavel(v_regime), false) THEN
    RAISE EXCEPTION 'REGIME_NAO_CONVOCAVEL: este vínculo utiliza o fluxo de folgas.'
      USING ERRCODE = '42501';
  END IF;

  v_tz := public.dp_convocacao_timezone(v_company, v_unidade);
  v_hoje := (v_agora AT TIME ZONE v_tz)::date;

  IF p_data < v_hoje THEN
    RAISE EXCEPTION 'PAST_DATE_NOT_EDITABLE: datas passadas não podem ser alteradas.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_colab_id::text || '|' || p_data::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.dp_convocacoes c
     WHERE c.company_id = v_company
       AND c.colaborador_id = v_colab_id
       AND c.data = p_data
       AND (c.status IN ('aceita', 'encerrada_operacionalmente') OR c.comparecimento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'ACCEPTED_CALL_REQUIRES_REPLACEMENT: convocação confirmada neste dia.'
      USING ERRCODE = '22023';
  END IF;

  SELECT i.id INTO v_existente
    FROM public.dp_indisponibilidades i
   WHERE i.colaborador_id = v_colab_id
     AND i.data = p_data
     AND i.cancelada_em IS NULL
   LIMIT 1;

  IF v_existente IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'indisponibilidade_id', v_existente, 'data', p_data,
      'idempotente', true, 'ofertas_encerradas', 0, 'ofertas_encerradas_por_tempo', 0);
  END IF;

  INSERT INTO public.dp_indisponibilidades(
    company_id, colaborador_id, data, motivo, origem, criado_por)
  VALUES (v_company, v_colab_id, p_data, v_motivo, 'colaborador', v_uid)
  RETURNING id INTO v_id;

  -- 7a. ofertas já encerradas pelo tempo recebem o motivo temporal correto
  FOR r IN
    SELECT c.id, c.ocorrencia_id, c.prazo_resposta, c.inicio_previsto
      FROM public.dp_convocacoes c
     WHERE c.company_id = v_company
       AND c.colaborador_id = v_colab_id
       AND c.data = p_data
       AND c.status = 'pendente'
       AND c.ocorrencia_id IS NOT NULL
     FOR UPDATE
  LOOP
    v_enc := public.dp_convocacao_estado_encerramento(
      r.prazo_resposta, r.inicio_previsto, v_agora);
    IF v_enc IS NULL THEN
      CONTINUE;
    END IF;

    IF v_enc = 'sem_resposta' THEN
      v_status := 'sem_resposta';
      v_mot := 'DEADLINE_EXPIRED';
      v_evento := 'oferta_sem_resposta';
    ELSE
      v_status := 'encerrada_inicio_ocorrencia';
      v_mot := 'OCCURRENCE_ALREADY_STARTED';
      v_evento := 'oferta_encerrada_inicio';
    END IF;

    UPDATE public.dp_convocacoes
       SET status = v_status, encerrada_em = v_agora,
           encerramento_motivo = v_mot, updated_at = now()
     WHERE id = r.id AND status = 'pendente';

    IF FOUND THEN
      v_temporais := v_temporais + 1;
      PERFORM public.dp_convocacao_log_evento_trabalhador(
        v_company, NULL, r.ocorrencia_id, v_evento,
        jsonb_build_object('convocacao_id', r.id, 'motivo', v_mot, 'data', p_data));
    END IF;
  END LOOP;

  -- 7b. ofertas ainda vivas são encerradas pela indisponibilidade declarada
  FOR r IN
    WITH enc AS (
      UPDATE public.dp_convocacoes c
         SET status = 'cancelada',
             encerrada_em = v_agora,
             encerramento_motivo = 'INDISPONIBILIDADE_DECLARADA',
             updated_at = now()
       WHERE c.company_id = v_company
         AND c.colaborador_id = v_colab_id
         AND c.data = p_data
         AND c.status = 'pendente'
         AND c.ocorrencia_id IS NOT NULL
      RETURNING c.id, c.ocorrencia_id
    )
    SELECT * FROM enc
  LOOP
    v_encerradas := v_encerradas + 1;
    PERFORM public.dp_convocacao_log_evento_trabalhador(
      v_company, NULL, r.ocorrencia_id, 'oferta_encerrada_indisponibilidade',
      jsonb_build_object(
        'convocacao_id', r.id,
        'motivo', 'INDISPONIBILIDADE_DECLARADA',
        'data', p_data));
  END LOOP;

  PERFORM public.insert_audit_log(
    'indisponibilidade_criada', 'dp_indisponibilidades', v_id::text,
    jsonb_build_object('data', p_data, 'ofertas_encerradas', v_encerradas,
                       'ofertas_encerradas_por_tempo', v_temporais));

  RETURN jsonb_build_object(
    'ok', true, 'indisponibilidade_id', v_id, 'data', p_data,
    'idempotente', false, 'ofertas_encerradas', v_encerradas,
    'ofertas_encerradas_por_tempo', v_temporais);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_indisponibilidade_marcar(date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text)
  TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.dp_jornada_dia_prevista(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_cancelar_admin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text) FROM anon;