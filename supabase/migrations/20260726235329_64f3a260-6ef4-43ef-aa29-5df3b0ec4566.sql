-- =========================================================
-- FASE 1 (base) — dp_config_dp + dp_regras_historico
-- FASE 0 — unificação das triggers de dp_folgas
-- =========================================================

CREATE TYPE public.dp_politica_sabado AS ENUM ('trabalha','folga','alterna','especifica');
CREATE TYPE public.dp_politica_feriado AS ENUM ('compensa','dobro');
CREATE TYPE public.dp_regra_dsr AS ENUM ('clt','cct','propria');

CREATE TABLE public.dp_config_dp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  setor_comercio boolean NOT NULL DEFAULT true,
  periodicidade_domingo integer NOT NULL DEFAULT 3,
  periodicidade_domingo_mulher integer NOT NULL DEFAULT 2,
  folgas_fds_por_mes integer NOT NULL DEFAULT 1,
  politica_sabado public.dp_politica_sabado NOT NULL DEFAULT 'alterna',
  politica_feriado public.dp_politica_feriado NOT NULL DEFAULT 'compensa',
  regra_dsr public.dp_regra_dsr NOT NULL DEFAULT 'clt',
  exige_validacao_menor boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_config_dp TO authenticated;
GRANT ALL ON public.dp_config_dp TO service_role;
ALTER TABLE public.dp_config_dp ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_config_dp_admin_write" ON public.dp_config_dp
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_config_dp_read_member" ON public.dp_config_dp
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_config_dp_read_colaborador" ON public.dp_config_dp
  FOR SELECT TO authenticated
  USING (company_id = (
    SELECT c.company_id FROM public.dp_colaboradores c
     WHERE c.id = public.dp_colaborador_ativo_of(auth.uid())
  ));

CREATE TRIGGER dp_config_dp_upd BEFORE UPDATE ON public.dp_config_dp
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- ---------------------------------------------------------
-- Histórico imutável de alteração de regras
-- ---------------------------------------------------------
CREATE TABLE public.dp_regras_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usuario_id uuid,
  tabela text NOT NULL,
  registro_id uuid,
  valor_antigo jsonb,
  valor_novo jsonb,
  justificativa text,
  ciencia_confirmada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dp_regras_historico_company ON public.dp_regras_historico (company_id, created_at DESC);

GRANT SELECT, INSERT ON public.dp_regras_historico TO authenticated;
GRANT ALL ON public.dp_regras_historico TO service_role;
ALTER TABLE public.dp_regras_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_regras_historico_admin_read" ON public.dp_regras_historico
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_regras_historico_admin_insert" ON public.dp_regras_historico
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    AND usuario_id = auth.uid()
  );

-- ---------------------------------------------------------
-- Backfill: preserva 100% do comportamento atual
-- ---------------------------------------------------------
INSERT INTO public.dp_config_dp (company_id, setor_comercio, periodicidade_domingo, folgas_fds_por_mes)
SELECT c.id,
       COALESCE(s.nome IS NOT NULL AND s.nome <> 'Outro', false),
       CASE WHEN COALESCE(s.nome IS NOT NULL AND s.nome <> 'Outro', false) THEN 3 ELSE 7 END,
       1
  FROM public.companies c
  LEFT JOIN public.segmentos s ON s.id = c.segmento_id
ON CONFLICT (company_id) DO NOTHING;

-- Cria configuração automaticamente para novas empresas
CREATE OR REPLACE FUNCTION public.dp_config_dp_seed_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_comercio boolean;
BEGIN
  SELECT COALESCE(s.nome IS NOT NULL AND s.nome <> 'Outro', false)
    INTO v_comercio
    FROM public.segmentos s WHERE s.id = NEW.segmento_id;
  v_comercio := COALESCE(v_comercio, false);

  INSERT INTO public.dp_config_dp (company_id, setor_comercio, periodicidade_domingo, folgas_fds_por_mes)
  VALUES (NEW.id, v_comercio, CASE WHEN v_comercio THEN 3 ELSE 7 END, 1)
  ON CONFLICT (company_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_config_dp_seed AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.dp_config_dp_seed_on_company();

-- =========================================================
-- FASE 0 — Trigger unificada de dp_folgas
-- =========================================================
DROP TRIGGER IF EXISTS dp_folgas_validar ON public.dp_folgas;
DROP TRIGGER IF EXISTS trg_dp_folgas_validar_self ON public.dp_folgas;

CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_self boolean := (NEW.origem = 'solicitacao'::public.dp_folga_origem);
  v_limite int;
  v_qtd int;
  v_mensais int;
  v_teto int;
  v_bloq record;
  v_liberada boolean;
  v_fixa int;
  v_aniv record;
  v_bloq_individual boolean;
BEGIN
  IF NEW.status = 'cancelada' THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, folga_fixa_semana INTO v_unidade, v_fixa
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  -- ---------- 1) Bloqueio manual pontual (respeita liberada E liberada_por_solicitacao)
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

  -- ---------- 4) Limite diário por data (vale para todas as origens)
  IF NOT NEW.extra AND NEW.tipo NOT IN ('ferias','licenca') THEN
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
  IF v_self THEN
    -- 5a) teto mensal de folgas de fim de semana, lido de dp_config_dp
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

    -- 5b) dia de folga fixa
    IF v_fixa IS NOT NULL AND v_fixa = v_wd THEN
      RAISE EXCEPTION 'Este é seu dia de folga fixa. Use "Solicitar exceção" ou uma troca.'
        USING ERRCODE = 'check_violation';
    END IF;

    -- 5c) data reservada para aniversariante
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

CREATE TRIGGER dp_folgas_validar BEFORE INSERT ON public.dp_folgas
  FOR EACH ROW EXECUTE FUNCTION public.dp_folgas_validar_unificado();

DROP FUNCTION IF EXISTS public.dp_validar_folga_insert();
DROP FUNCTION IF EXISTS public.dp_folgas_validar_self();