-- 1) Assinatura de documento no portal: a Edge Function chama a rotina com o
-- token do colaborador; sem este GRANT o aceite falhava com permissão negada.
GRANT EXECUTE ON FUNCTION public.dp_documento_aceitar(uuid, text, text) TO authenticated;

-- ============================================================
-- 2) Pedidos de férias do colaborador: consulta, edição e remarcação
-- ============================================================

CREATE OR REPLACE FUNCTION public.dp_ferias_meus_pedidos()
RETURNS TABLE (
  solicitacao_id uuid,
  periodo_id uuid,
  status text,
  data_inicio date,
  data_fim date,
  dias smallint,
  dias_abono smallint,
  adiantar_13 boolean,
  observacao text,
  resposta_admin text,
  criado_em timestamptz,
  respondido_em timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_colab uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  IF v_colab IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, d.periodo_id, s.status::text,
         d.data_inicio, d.data_fim, d.dias, d.dias_abono, d.adiantar_13,
         COALESCE(d.observacao, s.motivo), s.resposta_admin,
         s.created_at, s.respondido_em
    FROM public.dp_solicitacoes s
    JOIN public.dp_ferias_solicitacao_detalhes d ON d.solicitacao_id = s.id
   WHERE s.colaborador_id = v_colab
     AND s.tipo = 'ferias'
     AND s.removido_em IS NULL
   ORDER BY s.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_ferias_meus_pedidos() TO authenticated;

-- Editar o próprio pedido enquanto o gestor ainda não respondeu.
CREATE OR REPLACE FUNCTION public.dp_ferias_pedido_editar(
  _solicitacao_id uuid,
  _data_inicio date,
  _data_fim date,
  _dias_abono integer DEFAULT 0,
  _adiantar_13 boolean DEFAULT false,
  _observacao text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_col record;
  v_sol record;
  v_det record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  IF _solicitacao_id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA';
  END IF;
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  SELECT * INTO v_sol
    FROM public.dp_solicitacoes
   WHERE id = _solicitacao_id AND tipo = 'ferias' AND removido_em IS NULL
   FOR UPDATE;
  IF v_sol.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_NAO_ENCONTRADA';
  END IF;
  IF v_sol.status <> 'pendente'::public.dp_solicitacao_status THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_JA_RESPONDIDA';
  END IF;

  SELECT id, company_id, user_id, unidade_id INTO v_col
    FROM public.dp_colaboradores WHERE id = v_sol.colaborador_id;
  IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid()
     OR NOT private.dp_pode_agir(auth.uid()) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  SELECT * INTO v_det
    FROM public.dp_ferias_solicitacao_detalhes
   WHERE solicitacao_id = _solicitacao_id
   FOR UPDATE;
  IF v_det.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_SEM_DETALHES';
  END IF;

  PERFORM private.dp_ferias_fila(v_col.id, v_col.company_id, v_col.unidade_id);

  PERFORM public.dp_ferias_validar_programacao(
    v_col.id, v_det.periodo_id, _data_inicio, _data_fim,
    COALESCE(_dias_abono, 0), NULL, NULL, 'pedido');

  IF EXISTS (
    SELECT 1
      FROM public.dp_ferias_solicitacao_detalhes d
      JOIN public.dp_solicitacoes s ON s.id = d.solicitacao_id
     WHERE d.colaborador_id = v_col.id
       AND s.id <> _solicitacao_id
       AND s.status = 'pendente'
       AND s.removido_em IS NULL
       AND daterange(d.data_inicio, d.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_DUPLICADA';
  END IF;

  UPDATE public.dp_solicitacoes
     SET data_alvo = _data_inicio,
         data_fim = _data_fim,
         motivo = NULLIF(btrim(_observacao), ''),
         corrigido_em = now(),
         corrigido_por = auth.uid(),
         updated_at = now()
   WHERE id = _solicitacao_id;

  UPDATE public.dp_ferias_solicitacao_detalhes
     SET data_inicio = _data_inicio,
         data_fim = _data_fim,
         dias = (_data_fim - _data_inicio + 1)::smallint,
         dias_abono = COALESCE(_dias_abono, 0)::smallint,
         adiantar_13 = COALESCE(_adiantar_13, false),
         observacao = NULLIF(btrim(_observacao), ''),
         updated_at = now()
   WHERE solicitacao_id = _solicitacao_id;

  RETURN _solicitacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_ferias_pedido_editar(uuid, date, date, integer, boolean, text)
  TO authenticated;

-- Pedir remarcação de férias já aprovadas: nasce como novo pedido pendente e
-- as férias atuais continuam valendo até a decisão do gestor.
CREATE OR REPLACE FUNCTION public.dp_ferias_remarcacao_solicitar(
  _gozo_id uuid,
  _data_inicio date,
  _data_fim date,
  _motivo text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_gozo record;
  v_col record;
  v_texto text;
  v_solicitacao_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  IF _data_inicio IS NULL OR _data_fim IS NULL OR _data_fim < _data_inicio THEN
    RAISE EXCEPTION 'FERIAS_DATAS_INVALIDAS';
  END IF;
  IF _data_inicio <= CURRENT_DATE THEN
    RAISE EXCEPTION 'FERIAS_DATA_PASSADA';
  END IF;

  SELECT g.* INTO v_gozo FROM public.dp_ferias_gozos g WHERE g.id = _gozo_id;
  IF v_gozo.id IS NULL THEN
    RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA';
  END IF;
  IF v_gozo.status::text IN ('cancelado', 'concluido', 'em_gozo') THEN
    RAISE EXCEPTION 'FERIAS_JA_CONCLUIDA';
  END IF;

  SELECT id, company_id, user_id, unidade_id INTO v_col
    FROM public.dp_colaboradores WHERE id = v_gozo.colaborador_id;
  IF v_col.user_id IS NULL OR v_col.user_id <> auth.uid()
     OR NOT private.dp_pode_agir(auth.uid()) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;

  PERFORM private.dp_ferias_fila(v_col.id, v_col.company_id, v_col.unidade_id);

  -- o período atual é desconsiderado na conferência: ele só sai se o gestor aprovar
  PERFORM public.dp_ferias_validar_programacao(
    v_col.id, v_gozo.periodo_id, _data_inicio, _data_fim,
    COALESCE(v_gozo.dias_abono, 0), NULL, _gozo_id, 'pedido');

  IF EXISTS (
    SELECT 1
      FROM public.dp_ferias_solicitacao_detalhes d
      JOIN public.dp_solicitacoes s ON s.id = d.solicitacao_id
     WHERE d.colaborador_id = v_col.id
       AND s.status = 'pendente'
       AND s.removido_em IS NULL
       AND daterange(d.data_inicio, d.data_fim, '[]') && daterange(_data_inicio, _data_fim, '[]')
  ) THEN
    RAISE EXCEPTION 'FERIAS_SOLICITACAO_DUPLICADA';
  END IF;

  v_texto := 'Remarcação das férias de '
             || to_char(v_gozo.data_inicio, 'DD/MM/YYYY') || ' a '
             || to_char(v_gozo.data_fim, 'DD/MM/YYYY')
             || COALESCE('. ' || NULLIF(btrim(_motivo), ''), '');

  INSERT INTO public.dp_solicitacoes (
    company_id, colaborador_id, criado_por, tipo, data_alvo, data_fim, motivo, status
  ) VALUES (
    v_col.company_id, v_col.id, auth.uid(), 'ferias', _data_inicio, _data_fim, v_texto, 'pendente'
  )
  RETURNING id INTO v_solicitacao_id;

  INSERT INTO public.dp_ferias_solicitacao_detalhes (
    company_id, solicitacao_id, periodo_id, colaborador_id,
    data_inicio, data_fim, dias, dias_abono, adiantar_13, observacao
  ) VALUES (
    v_col.company_id, v_solicitacao_id, v_gozo.periodo_id, v_col.id,
    _data_inicio, _data_fim, (_data_fim - _data_inicio + 1)::smallint,
    COALESCE(v_gozo.dias_abono, 0)::smallint, COALESCE(v_gozo.adiantar_13, false),
    v_texto
  );

  RETURN v_solicitacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dp_ferias_remarcacao_solicitar(uuid, date, date, text)
  TO authenticated;

-- ============================================================
-- 3) Folga de fim de semana no mês de férias
-- ============================================================

-- Datas de férias/licença da pessoa dentro da competência.
CREATE OR REPLACE FUNCTION public.dp_folga_ferias_no_mes(
  _company uuid, _colab uuid, _competencia date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH lim AS (
    SELECT date_trunc('month', COALESCE(_competencia, now()::date))::date AS ini,
           (date_trunc('month', COALESCE(_competencia, now()::date))
             + interval '1 month - 1 day')::date AS fim
  ), faixas AS (
    SELECT GREATEST(g.data_inicio, lim.ini) AS ini, LEAST(g.data_fim, lim.fim) AS fim
      FROM public.dp_ferias_gozos g, lim
     WHERE g.colaborador_id = _colab
       AND g.status::text <> 'cancelado'
       AND g.data_inicio <= lim.fim AND g.data_fim >= lim.ini
    UNION ALL
    SELECT f.data, f.data
      FROM public.dp_folgas f, lim
     WHERE f.colaborador_id = _colab
       AND f.company_id = _company
       AND f.status::text <> 'cancelada'
       AND f.tipo::text IN ('ferias', 'licenca')
       AND f.data BETWEEN lim.ini AND lim.fim
  )
  SELECT jsonb_build_object(
           'tem', COUNT(*) > 0,
           'inicio', MIN(ini),
           'fim', MAX(fim))
    FROM faixas;
$$;

GRANT EXECUTE ON FUNCTION public.dp_folga_ferias_no_mes(uuid, uuid, date) TO authenticated;

-- Data bloqueada (bloqueio pontual ou regra dinâmica), espelhando o validador.
CREATE OR REPLACE FUNCTION private.dp_folga_data_bloqueada(
  _company uuid, _unidade uuid, _data date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_bloq record;
  v_liberada boolean;
BEGIN
  IF _company IS NULL OR _data IS NULL THEN RETURN false; END IF;

  SELECT liberada_por_solicitacao, liberada
    INTO v_bloq
    FROM public.dp_datas_bloqueadas
   WHERE company_id = _company
     AND data = _data
     AND (unidade_id IS NULL OR unidade_id = _unidade)
     AND regra_id IS NULL
   ORDER BY (unidade_id = _unidade) DESC NULLS LAST, unidade_id NULLS LAST
   LIMIT 1;

  IF FOUND
     AND v_bloq.liberada_por_solicitacao IS NULL
     AND COALESCE(v_bloq.liberada, false) = false THEN
    RETURN true;
  END IF;

  IF public.dp_regra_bloqueia_data(_company, _unidade, _data) THEN
    SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false))
      INTO v_liberada
      FROM public.dp_datas_bloqueadas
     WHERE company_id = _company
       AND data = _data
       AND (unidade_id IS NULL OR unidade_id = _unidade)
     ORDER BY (unidade_id = _unidade) DESC NULLS LAST, unidade_id NULLS LAST
     LIMIT 1;
    IF NOT COALESCE(v_liberada, false) THEN RETURN true; END IF;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.dp_folga_data_bloqueada(uuid, uuid, date) FROM PUBLIC;

-- Férias em parte do mês não elimina mais a folga do mês: a pessoa segue
-- na distribuição quando ainda existe dia compatível fora das férias.
CREATE OR REPLACE FUNCTION public.dp_folga_exige_descanso_fds(
  _company uuid, _colab uuid, _dias integer[], _competencia date
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_c record;
  v_cfg_id uuid;
  v_fixa int;
  v_dias_trab int[];
  v_dias_uso int[] := COALESCE(_dias, '{}'::int[]);
  v_ini date := date_trunc('month', COALESCE(_competencia, now()::date))::date;
  v_fim date := (date_trunc('month', COALESCE(_competencia, now()::date)) + interval '1 month - 1 day')::date;
BEGIN
  IF _company IS NULL OR _colab IS NULL THEN RETURN false; END IF;

  SELECT c.id, c.regime, c.vinculo_label, c.unidade_id
    INTO v_c
    FROM public.dp_colaboradores c
   WHERE c.id = _colab AND c.company_id = _company
     AND c.deleted_at IS NULL AND c.ativo IS NOT false;

  IF v_c.id IS NULL THEN RETURN false; END IF;

  -- vínculos sem folga semanal a cumprir (intermitente, PJ, MEI, freelancer, estágio, temporário)
  IF v_c.regime IS NOT NULL AND v_c.regime::text <> 'clt' THEN RETURN false; END IF;

  -- sócios
  IF lower(COALESCE(v_c.vinculo_label, '')) IN ('socio', 'sócio') THEN RETURN false; END IF;

  SELECT t.id, t.folga_fixa_dow INTO v_cfg_id, v_fixa
    FROM public.dp_colaborador_config_trabalho t
   WHERE t.colaborador_id = _colab
     AND t.company_id = _company
     AND t.vigencia_fim IS NULL
   ORDER BY t.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NOT NULL THEN
    -- quem já não trabalha no domingo não precisa de folga dominical
    IF v_fixa = 0 THEN RETURN false; END IF;

    SELECT array_agg(d.dow ORDER BY d.dow) INTO v_dias_trab
      FROM public.dp_colaborador_config_dias d
     WHERE d.config_id = v_cfg_id AND d.trabalha IS TRUE;

    IF v_dias_trab IS NOT NULL AND array_length(v_dias_trab, 1) IS NOT NULL THEN
      IF NOT (0 = ANY (v_dias_trab)) THEN RETURN false; END IF;
      IF array_length(v_dias_uso, 1) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM unnest(v_dias_uso) AS x WHERE x = ANY (v_dias_trab)) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  -- férias / licença: só dispensa a folga quando não sobra dia compatível no mês
  IF array_length(v_dias_uso, 1) IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos g
       WHERE g.colaborador_id = _colab
         AND g.status::text <> 'cancelado'
         AND g.data_inicio <= v_fim AND g.data_fim >= v_ini
    ) OR EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = _colab
         AND f.status::text <> 'cancelada'
         AND f.tipo::text IN ('ferias', 'licenca')
         AND f.data BETWEEN v_ini AND v_fim
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM generate_series(v_ini, v_fim, interval '1 day') AS d
     WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias_uso)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_ferias_gozos g
          WHERE g.colaborador_id = _colab
            AND g.status::text <> 'cancelado'
            AND d::date BETWEEN g.data_inicio AND g.data_fim)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_folgas f
          WHERE f.colaborador_id = _colab
            AND f.status::text <> 'cancelada'
            AND f.tipo::text IN ('ferias', 'licenca')
            AND f.data = d::date)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- O validador aceita ignorar a data bloqueada apenas quando a distribuição
-- automática declara a prioridade de férias (conferida no servidor).
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_contingencia boolean := COALESCE(current_setting('dp.folga_auto_contingencia', true), 'off') = 'on';
  v_ignora_bloqueio boolean := COALESCE(current_setting('dp.folga_ignora_bloqueio', true), 'off') = 'on';
  v_limite int;
  v_qtd int;
  v_mensais int;
  v_teto int;
  v_bloq record;
  v_liberada boolean;
  v_fixa int;
  v_aniv record;
  v_bloq_individual boolean;
  v_socio boolean;
BEGIN
  IF NEW.status = 'cancelada' THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, folga_fixa_semana,
         lower(coalesce(vinculo_label, '')) IN ('socio', 'sócio')
    INTO v_unidade, v_fixa, v_socio
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  -- ---------- 1) Bloqueio manual pontual
  IF NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra AND NOT v_ignora_bloqueio THEN
    SELECT motivo, liberada_por_solicitacao, liberada
      INTO v_bloq
      FROM public.dp_datas_bloqueadas
     WHERE company_id = NEW.company_id
       AND data = NEW.data
       AND (unidade_id IS NULL OR unidade_id = v_unidade)
       AND regra_id IS NULL
     ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST
     LIMIT 1;

    IF FOUND
       AND v_bloq.liberada_por_solicitacao IS NULL
       AND COALESCE(v_bloq.liberada, false) = false THEN
      RAISE EXCEPTION 'Data % está bloqueada administrativamente.', NEW.data
        USING ERRCODE = 'check_violation';
    END IF;

    -- ---------- 2) Regras dinâmicas de bloqueio
    IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
      SELECT (liberada_por_solicitacao IS NOT NULL OR COALESCE(liberada, false))
        INTO v_liberada
        FROM public.dp_datas_bloqueadas
       WHERE company_id = NEW.company_id
         AND data = NEW.data
         AND (unidade_id IS NULL OR unidade_id = v_unidade)
       ORDER BY (unidade_id = v_unidade) DESC NULLS LAST, unidade_id NULLS LAST
       LIMIT 1;
      IF NOT COALESCE(v_liberada, false) THEN
        RAISE EXCEPTION 'Esta data está bloqueada por regra da empresa.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ---------- 3) Bloqueio individual do colaborador
  SELECT EXISTS (
    SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id
      AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true
      AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data
      AND (bl.fim IS NULL OR bl.fim >= NEW.data)
  ) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Colaborador está bloqueado para marcar folga em %', NEW.data
      USING ERRCODE = 'check_violation';
  END IF;

  -- ---------- 4) Limite diário por data
  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') AND NOT v_contingencia THEN
    SELECT limite_folgas INTO v_limite
      FROM public.dp_dia_config
     WHERE company_id = NEW.company_id
       AND data = NEW.data
       AND (unidade_id = v_unidade OR unidade_id IS NULL)
     ORDER BY (unidade_id IS NOT NULL) DESC
     LIMIT 1;

    IF v_limite IS NOT NULL AND v_limite > 0 THEN
      SELECT COUNT(*) INTO v_qtd
        FROM public.dp_folgas f
       WHERE f.company_id = NEW.company_id
         AND f.data = NEW.data
         AND f.status <> 'cancelada'
         AND f.extra = false
         AND f.tipo NOT IN ('ferias','licenca')
         AND (v_unidade IS NULL OR EXISTS (
             SELECT 1 FROM public.dp_colaboradores c2
              WHERE c2.id = f.colaborador_id AND c2.unidade_id = v_unidade
           ));
      IF v_qtd >= v_limite THEN
        RAISE EXCEPTION 'Limite diário de folgas (%) atingido em %', v_limite, NEW.data
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ---------- 5) Regras de AUTOATENDIMENTO (somente origem = 'solicitacao')
  IF v_self AND NOT COALESCE(v_socio, false) THEN
    IF v_wd IN (0, 6) AND NOT NEW.extra THEN
      SELECT folgas_fds_por_mes INTO v_teto
        FROM public.dp_config_dp WHERE company_id = NEW.company_id;
      v_teto := COALESCE(v_teto, 1);

      IF v_teto > 0 THEN
        SELECT count(*) INTO v_mensais
          FROM public.dp_folgas
         WHERE colaborador_id = NEW.colaborador_id
           AND extra = false
           AND status <> 'cancelada'
           AND EXTRACT(DOW FROM data) IN (0, 6)
           AND date_trunc('month', data) = date_trunc('month', NEW.data);
        IF v_mensais >= v_teto THEN
          RAISE EXCEPTION 'Você já atingiu o limite de % folga(s) de fim de semana neste mês.', v_teto
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;
    END IF;

    IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
      RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT pa.colaborador_id
      INTO v_aniv
      FROM public.dp_prioridade_aniversario pa
      JOIN public.dp_colaboradores c ON c.id = pa.colaborador_id
     WHERE pa.company_id = NEW.company_id
       AND pa.ano = EXTRACT(YEAR FROM NEW.data)::int
       AND pa.mes = EXTRACT(MONTH FROM NEW.data)::int
       AND pa.aniversariante = true
       AND c.data_nascimento IS NOT NULL
       AND EXTRACT(DAY FROM c.data_nascimento) = EXTRACT(DAY FROM NEW.data)
     LIMIT 1;
    IF FOUND AND v_aniv.colaborador_id <> NEW.colaborador_id THEN
      RAISE EXCEPTION 'Data reservada para aniversariante.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
