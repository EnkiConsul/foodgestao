-- ============================================================
-- Folgas: período mensal de escolha + atribuição automática
-- ============================================================

-- 1) Configuração da janela
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS folga_janela_ativa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folga_janela_abre_dia integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS folga_janela_fecha_dia integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS folga_autoatribuir boolean NOT NULL DEFAULT true;

ALTER TABLE public.dp_config_dp DROP CONSTRAINT IF EXISTS ck_dp_config_dp_folga_janela_dias;
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT ck_dp_config_dp_folga_janela_dias
  CHECK (folga_janela_abre_dia BETWEEN 1 AND 28
         AND folga_janela_fecha_dia BETWEEN 1 AND 28
         AND folga_janela_abre_dia <= folga_janela_fecha_dia);

-- 2) Marcação de pedido excepcional
ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS fora_da_janela boolean NOT NULL DEFAULT false;

-- 3) Origem da folga gerada no fechamento
ALTER TYPE public.dp_folga_origem ADD VALUE IF NOT EXISTS 'auto_fechamento_periodo';

-- 4) Dias de fim de semana aplicáveis conforme a regra efetiva da empresa/unidade
CREATE OR REPLACE FUNCTION public.dp_folga_dias_fds_aplicaveis(_company uuid, _unidade uuid)
RETURNS int[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_dias int[] := '{}';
BEGIN
  SELECT tipo_descanso_domingo, dias_descanso_negociados, politica_sabado
    INTO v_cfg
    FROM public.dp_config_dp
   WHERE company_id = _company
     AND (unidade_id IS NULL OR unidade_id = _unidade)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[0];
  END IF;

  IF v_cfg.tipo_descanso_domingo = 'acordo_coletivo'
     AND v_cfg.dias_descanso_negociados IS NOT NULL
     AND array_length(v_cfg.dias_descanso_negociados, 1) > 0 THEN
    SELECT array_agg(DISTINCT d ORDER BY d) INTO v_dias
      FROM unnest(v_cfg.dias_descanso_negociados) AS d
     WHERE d IN (0, 6);
  END IF;

  IF v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    v_dias := ARRAY[0];
  END IF;

  IF v_cfg.politica_sabado = 'folga' AND NOT (6 = ANY (v_dias)) THEN
    v_dias := v_dias || 6;
  END IF;

  SELECT array_agg(DISTINCT d ORDER BY d) INTO v_dias FROM unnest(v_dias) AS d;
  RETURN v_dias;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_dias_fds_aplicaveis(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_dias_fds_aplicaveis(uuid, uuid) TO authenticated, service_role;

-- 5) Janela efetiva (sempre referente ao mês seguinte, no fuso da operação)
CREATE OR REPLACE FUNCTION public.dp_folgas_janela_efetiva(
  _company uuid,
  _unidade uuid DEFAULT NULL,
  _data_ref date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg record;
  v_tz text;
  v_hoje date;
  v_abre date;
  v_fecha date;
  v_comp date;
  v_estado text;
BEGIN
  IF _company IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa obrigatória.' USING ERRCODE = '22023';
  END IF;

  SELECT folga_janela_ativa, folga_janela_abre_dia, folga_janela_fecha_dia,
         folga_autoatribuir, folgas_fds_por_mes
    INTO v_cfg
    FROM public.dp_config_dp
   WHERE company_id = _company
     AND (unidade_id IS NULL OR unidade_id = _unidade)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  v_tz := public.dp_convocacao_timezone(_company, _unidade);
  v_hoje := COALESCE(_data_ref, (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date);

  v_comp := (date_trunc('month', v_hoje) + interval '1 month')::date;
  v_abre := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_abre_dia, 10) - 1);
  v_fecha := date_trunc('month', v_hoje)::date + (COALESCE(v_cfg.folga_janela_fecha_dia, 20) - 1);

  v_estado := CASE
    WHEN v_hoje < v_abre THEN 'antes'
    WHEN v_hoje > v_fecha THEN 'encerrada'
    ELSE 'aberta'
  END;

  RETURN jsonb_build_object(
    'ativa', COALESCE(v_cfg.folga_janela_ativa, false),
    'autoatribuir', COALESCE(v_cfg.folga_autoatribuir, true),
    'abre_dia', COALESCE(v_cfg.folga_janela_abre_dia, 10),
    'fecha_dia', COALESCE(v_cfg.folga_janela_fecha_dia, 20),
    'hoje', v_hoje,
    'abre_em', v_abre,
    'fecha_em', v_fecha,
    'competencia', v_comp,
    'folgas_exigidas', COALESCE(v_cfg.folgas_fds_por_mes, 1),
    'estado', v_estado);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folgas_janela_efetiva(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folgas_janela_efetiva(uuid, uuid, date) TO authenticated, service_role;

-- 6) Marcação do colaborador respeita a janela; fora dela só como exceção
DROP FUNCTION IF EXISTS public.dp_folga_solicitar(date, text);

CREATE OR REPLACE FUNCTION public.dp_folga_solicitar(
  p_data date,
  p_motivo text DEFAULT NULL,
  p_fora_da_janela boolean DEFAULT false
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
  v_res jsonb;
  v_janela jsonb;
  v_fora boolean := false;
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

  -- Janela mensal: a marcação normal só vale para o mês-alvo, com a janela aberta.
  v_janela := public.dp_folgas_janela_efetiva(v_company, v_unidade, NULL);
  IF COALESCE((v_janela->>'ativa')::boolean, false) THEN
    IF (v_janela->>'estado') <> 'aberta'
       OR date_trunc('month', p_data) <> date_trunc('month', (v_janela->>'competencia')::date) THEN
      IF NOT COALESCE(p_fora_da_janela, false) THEN
        RAISE EXCEPTION 'FOLGA_FORA_DA_JANELA: fora do período de escolha das folgas.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_fora := true;
    END IF;
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

  v_res := public.dp_folga_limite_dia(v_company, v_unidade, v_cargo, p_data, v_colab);

  IF COALESCE((v_res->>'excedido')::boolean, false) THEN
    RAISE EXCEPTION 'FOLGA_LIMITE_DIA: este dia já atingiu o limite de pessoas em folga.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.dp_solicitacoes(
    company_id, colaborador_id, criado_por, tipo, data_alvo, motivo, status, fora_da_janela)
  VALUES (v_company, v_colab, v_uid, 'folga', p_data,
          CASE WHEN v_fora THEN
            'FORA_DA_JANELA_DE_MARCACAO' || COALESCE(' — ' || v_motivo, '')
          ELSE v_motivo END,
          'pendente', v_fora)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'solicitacao_id', v_id, 'limite', v_res,
    'fora_da_janela', v_fora, 'janela', v_janela);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_solicitar(date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_solicitar(date, text, boolean) TO authenticated, service_role;

-- 7) Controle das execuções da distribuição automática
CREATE TABLE IF NOT EXISTS public.dp_folga_autoatribuicao_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  iniciada_em timestamptz,
  concluida_em timestamptz,
  quantidade_gerada integer NOT NULL DEFAULT 0,
  quantidade_excedida integer NOT NULL DEFAULT 0,
  detalhes jsonb NOT NULL DEFAULT '[]'::jsonb,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_dp_folga_auto_status
    CHECK (status IN ('pendente', 'processando', 'concluida', 'erro'))
);

GRANT SELECT ON public.dp_folga_autoatribuicao_execucoes TO authenticated;
GRANT ALL ON public.dp_folga_autoatribuicao_execucoes TO service_role;

ALTER TABLE public.dp_folga_autoatribuicao_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dp_folga_auto_exec_read_admin ON public.dp_folga_autoatribuicao_execucoes;
CREATE POLICY dp_folga_auto_exec_read_admin
  ON public.dp_folga_autoatribuicao_execucoes
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE UNIQUE INDEX IF NOT EXISTS ux_dp_folga_auto_exec
  ON public.dp_folga_autoatribuicao_execucoes
  (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia);

CREATE INDEX IF NOT EXISTS ix_dp_folga_auto_exec_company
  ON public.dp_folga_autoatribuicao_execucoes (company_id, competencia DESC);

DROP TRIGGER IF EXISTS trg_dp_folga_auto_exec_updated_at ON public.dp_folga_autoatribuicao_execucoes;
CREATE TRIGGER trg_dp_folga_auto_exec_updated_at
  BEFORE UPDATE ON public.dp_folga_autoatribuicao_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- 8) Distribuição automática do mês-alvo
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_competencia(
  _company uuid,
  _unidade uuid,
  _competencia date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp date := date_trunc('month', _competencia)::date;
  v_fim date := (date_trunc('month', _competencia) + interval '1 month - 1 day')::date;
  v_dias int[];
  v_exigidas int;
  v_exec_id uuid;
  v_colab record;
  v_data date;
  v_escolhida date;
  v_lim jsonb;
  v_melhor_ocupacao int;
  v_faltam int;
  v_geradas int := 0;
  v_excedidas int := 0;
  v_detalhes jsonb := '[]'::jsonb;
  v_contingencia boolean;
  v_ja int;
BEGIN
  IF _company IS NULL OR _competencia IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT: empresa e competência obrigatórias.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    _company::text || '|folga_auto|' || COALESCE(_unidade::text, 'todas') || '|' || v_comp::text, 0));

  SELECT id, status INTO v_exec_id, v_contingencia
    FROM public.dp_folga_autoatribuicao_execucoes
   WHERE company_id = _company
     AND COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(_unidade, '00000000-0000-0000-0000-000000000000'::uuid)
     AND competencia = v_comp
   FOR UPDATE;

  IF v_exec_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes
     WHERE id = v_exec_id AND status = 'concluida'
  ) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true, 'execucao_id', v_exec_id);
  END IF;

  IF v_exec_id IS NULL THEN
    INSERT INTO public.dp_folga_autoatribuicao_execucoes(
      company_id, unidade_id, competencia, status, iniciada_em)
    VALUES (_company, _unidade, v_comp, 'processando', now())
    RETURNING id INTO v_exec_id;
  ELSE
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'processando', iniciada_em = now(), erro = NULL
     WHERE id = v_exec_id;
  END IF;

  v_dias := public.dp_folga_dias_fds_aplicaveis(_company, _unidade);
  SELECT COALESCE((public.dp_folgas_janela_efetiva(_company, _unidade, NULL)->>'folgas_exigidas')::int, 1)
    INTO v_exigidas;

  IF v_exigidas <= 0 OR v_dias IS NULL OR array_length(v_dias, 1) IS NULL THEN
    UPDATE public.dp_folga_autoatribuicao_execucoes
       SET status = 'concluida', concluida_em = now(), quantidade_gerada = 0, quantidade_excedida = 0
     WHERE id = v_exec_id;
    RETURN jsonb_build_object('ok', true, 'geradas', 0, 'excedidas', 0, 'execucao_id', v_exec_id);
  END IF;

  FOR v_colab IN
    SELECT c.id, c.cargo_id, c.unidade_id, c.nome
      FROM public.dp_colaboradores c
     WHERE c.company_id = _company
       AND c.deleted_at IS NULL
       AND c.ativo IS NOT false
       AND (_unidade IS NULL OR c.unidade_id = _unidade)
       AND lower(COALESCE(c.vinculo_label, '')) NOT IN ('socio', 'sócio')
     ORDER BY c.nome
  LOOP
    SELECT count(*) INTO v_ja
      FROM public.dp_folgas f
     WHERE f.colaborador_id = v_colab.id
       AND f.data BETWEEN v_comp AND v_fim
       AND f.status <> 'cancelada'
       AND f.extra = false
       AND f.tipo NOT IN ('ferias', 'licenca')
       AND EXTRACT(DOW FROM f.data)::int = ANY (v_dias);

    v_faltam := v_exigidas - COALESCE(v_ja, 0);

    WHILE v_faltam > 0 LOOP
      v_escolhida := NULL;
      v_melhor_ocupacao := NULL;
      v_contingencia := false;

      -- Prioridade 1 e 2: dia vazio, senão o dia com menor ocupação e vaga
      FOR v_data IN
        SELECT d::date FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
         ORDER BY d
      LOOP
        IF EXISTS (
          SELECT 1 FROM public.dp_folgas f
           WHERE f.colaborador_id = v_colab.id AND f.data = v_data AND f.status <> 'cancelada'
        ) THEN
          CONTINUE;
        END IF;

        v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_data, NULL);

        IF COALESCE((v_lim->>'excedido')::boolean, false) THEN
          CONTINUE;
        END IF;

        IF (v_lim->>'em_folga')::int = 0 THEN
          v_escolhida := v_data;
          EXIT;
        END IF;

        IF v_melhor_ocupacao IS NULL OR (v_lim->>'em_folga')::int < v_melhor_ocupacao THEN
          v_melhor_ocupacao := (v_lim->>'em_folga')::int;
          v_escolhida := v_data;
        END IF;
      END LOOP;

      -- Prioridade 3: tudo lotado, começa pelos últimos dias do mês
      IF v_escolhida IS NULL THEN
        v_contingencia := true;
        SELECT d::date INTO v_escolhida
          FROM generate_series(v_comp, v_fim, interval '1 day') AS d
         WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias)
           AND NOT EXISTS (
             SELECT 1 FROM public.dp_folgas f
              WHERE f.colaborador_id = v_colab.id AND f.data = d::date
                AND f.status <> 'cancelada')
         ORDER BY d DESC
         LIMIT 1;
      END IF;

      EXIT WHEN v_escolhida IS NULL;

      v_lim := public.dp_folga_limite_dia(_company, v_colab.unidade_id, v_colab.cargo_id, v_escolhida, NULL);

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'on', true);
      END IF;

      INSERT INTO public.dp_folgas(
        company_id, colaborador_id, data, tipo, origem, status, extra, observacao)
      VALUES (_company, v_colab.id, v_escolhida, 'normal',
              'auto_fechamento_periodo', 'agendada', false,
              'Folga definida automaticamente no fechamento do período de escolha.');

      IF v_contingencia THEN
        PERFORM set_config('dp.folga_auto_contingencia', 'off', true);
        v_excedidas := v_excedidas + 1;
        v_detalhes := v_detalhes || jsonb_build_object(
          'colaborador_id', v_colab.id,
          'colaborador_nome', v_colab.nome,
          'cargo_id', v_colab.cargo_id,
          'unidade_id', v_colab.unidade_id,
          'data', v_escolhida,
          'competencia', v_comp,
          'regra_id', v_lim->'regra_id',
          'limite', v_lim->'limite',
          'ocupacao_anterior', v_lim->'em_folga',
          'ocupacao_resultante', COALESCE((v_lim->>'em_folga')::int, 0) + 1,
          'motivo', 'SEM_VAGA_NO_MES');
      END IF;

      v_geradas := v_geradas + 1;
      v_faltam := v_faltam - 1;
    END LOOP;
  END LOOP;

  UPDATE public.dp_folga_autoatribuicao_execucoes
     SET status = 'concluida', concluida_em = now(),
         quantidade_gerada = v_geradas, quantidade_excedida = v_excedidas,
         detalhes = v_detalhes
   WHERE id = v_exec_id;

  RETURN jsonb_build_object(
    'ok', true, 'execucao_id', v_exec_id, 'geradas', v_geradas,
    'excedidas', v_excedidas, 'competencia', v_comp);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuir_competencia(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_competencia(uuid, uuid, date) TO service_role;

-- 9) Varredura diária: empresas/unidades com janela encerrada e ainda não processadas
CREATE OR REPLACE FUNCTION public.dp_folga_autoatribuir_todas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alvo record;
  v_janela jsonb;
  v_processadas int := 0;
  v_geradas int := 0;
  v_res jsonb;
BEGIN
  FOR v_alvo IN
    SELECT DISTINCT c.company_id, c.unidade_id
      FROM public.dp_colaboradores c
     WHERE c.deleted_at IS NULL
       AND c.ativo IS NOT false
  LOOP
    v_janela := public.dp_folgas_janela_efetiva(v_alvo.company_id, v_alvo.unidade_id, NULL);

    CONTINUE WHEN NOT COALESCE((v_janela->>'ativa')::boolean, false);
    CONTINUE WHEN NOT COALESCE((v_janela->>'autoatribuir')::boolean, false);
    CONTINUE WHEN (v_janela->>'estado') <> 'encerrada';

    IF EXISTS (
      SELECT 1 FROM public.dp_folga_autoatribuicao_execucoes e
       WHERE e.company_id = v_alvo.company_id
         AND COALESCE(e.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
             = COALESCE(v_alvo.unidade_id, '00000000-0000-0000-0000-000000000000'::uuid)
         AND e.competencia = (v_janela->>'competencia')::date
         AND e.status = 'concluida'
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_res := public.dp_folga_autoatribuir_competencia(
        v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date);
      v_processadas := v_processadas + 1;
      v_geradas := v_geradas + COALESCE((v_res->>'geradas')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.dp_folga_autoatribuicao_execucoes(
        company_id, unidade_id, competencia, status, iniciada_em, erro)
      VALUES (v_alvo.company_id, v_alvo.unidade_id, (v_janela->>'competencia')::date,
              'erro', now(), SQLERRM)
      ON CONFLICT (company_id, COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), competencia)
      DO UPDATE SET status = 'erro', erro = EXCLUDED.erro, updated_at = now();
    END;
  END LOOP;

  RETURN jsonb_build_object('processadas', v_processadas, 'geradas', v_geradas);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_folga_autoatribuir_todas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folga_autoatribuir_todas() TO service_role;

-- 10) Contingência pode passar do limite pontual do dia (somente pelo processo automático)
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_contingencia boolean := COALESCE(current_setting('dp.folga_auto_contingencia', true), 'off') = 'on';
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
  IF NEW.tipo NOT IN ('ferias','licenca') AND NOT NEW.extra THEN
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
  --  A distribuição automática de contingência registra o excesso em auditoria
  --  e por isso é a única origem autorizada a passar deste limite.
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

-- 11) Execução diária (uma vez por dia, após o horário dos demais jobs de DP)
SELECT cron.unschedule('dp-folga-autoatribuicao-diaria')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dp-folga-autoatribuicao-diaria');

SELECT cron.schedule(
  'dp-folga-autoatribuicao-diaria',
  '35 3 * * *',
  $$ SELECT public.dp_folga_autoatribuir_todas(); $$
);