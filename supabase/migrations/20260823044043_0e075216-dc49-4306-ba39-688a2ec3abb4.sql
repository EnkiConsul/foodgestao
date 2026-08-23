-- Sócio: forma de remuneração (pró-labore ou somente participação de lucros).
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS socio_remuneracao text;

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_socio_remuneracao_chk;
ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_socio_remuneracao_chk
  CHECK (socio_remuneracao IS NULL OR socio_remuneracao IN ('pro_labore','somente_lucros'));

-- Só o vínculo Sócio usa a forma de remuneração societária; os demais precisam
-- ficar nulos para não confundir a folha e a conferência de documentos.
CREATE OR REPLACE FUNCTION public.dp_socio_remuneracao_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(coalesce(NEW.vinculo_label, '')) IN ('socio', 'sócio') THEN
    IF NEW.socio_remuneracao IS NULL THEN
      NEW.socio_remuneracao := 'pro_labore';
    END IF;
  ELSE
    NEW.socio_remuneracao := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_dp_socio_remuneracao_guard ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_socio_remuneracao_guard
  BEFORE INSERT OR UPDATE ON public.dp_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.dp_socio_remuneracao_guard();

-- Folgas: sócio marca folga livremente (sem teto de fim de semana, folga fixa
-- ou reserva de aniversariante). Bloqueios administrativos continuam valendo.
CREATE OR REPLACE FUNCTION public.dp_folgas_validar_unificado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_socio boolean;
BEGIN
  IF NEW.status = 'cancelada' THEN
    RETURN NEW;
  END IF;

  SELECT unidade_id, folga_fixa_semana,
         lower(coalesce(vinculo_label, '')) IN ('socio', 'sócio')
    INTO v_unidade, v_fixa, v_socio
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
  --  Sócio é isento: não tem jornada contratual nem DSR.
  IF v_self AND NOT COALESCE(v_socio, false) THEN
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
$function$;