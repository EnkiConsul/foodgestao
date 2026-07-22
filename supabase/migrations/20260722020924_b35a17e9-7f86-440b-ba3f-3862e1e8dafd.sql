-- Fix: dp_folgas_validar_self must honor liberada=true (admin override) not only liberada_por_solicitacao.
-- Sem essa correção, o "Liberar Data" do admin (que grava liberada=true) não desbloqueia
-- efetivamente a data — a trigger continua rejeitando folgas na mesma.

CREATE OR REPLACE FUNCTION public.dp_folgas_validar_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade uuid;
  v_wd int := EXTRACT(DOW FROM NEW.data)::int;
  v_mensais int;
  v_bloq record;
  v_liberada boolean;
  v_fixa int;
  v_aniv record;
BEGIN
  SELECT unidade_id INTO v_unidade
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;

  IF NEW.status = 'cancelada' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_mensais
    FROM public.dp_folgas
   WHERE colaborador_id = NEW.colaborador_id
     AND extra = false
     AND status <> 'cancelada'
     AND EXTRACT(DOW FROM data) IN (0, 6)
     AND date_trunc('month', data) = date_trunc('month', NEW.data);
  IF v_mensais >= 1 THEN
    RAISE EXCEPTION 'Você já possui uma folga de fim de semana neste mês.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5a) bloqueio manual pontual em dp_datas_bloqueadas
  --     Um override com liberada=true OU liberada_por_solicitacao definido libera a data.
  SELECT motivo, liberada_por_solicitacao, liberada
    INTO v_bloq
    FROM public.dp_datas_bloqueadas
   WHERE company_id = NEW.company_id
     AND data = NEW.data
     AND (unidade_id IS NULL OR unidade_id = v_unidade)
     AND regra_id IS NULL
   ORDER BY unidade_id NULLS LAST
   LIMIT 1;
  IF FOUND
     AND v_bloq.liberada_por_solicitacao IS NULL
     AND COALESCE(v_bloq.liberada, false) = false THEN
    RAISE EXCEPTION 'Esta data está bloqueada administrativamente.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5b) regras dinâmicas em dp_bloqueio_regras (runtime)
  IF public.dp_regra_bloqueia_data(NEW.company_id, v_unidade, NEW.data) THEN
    -- Prioriza override do escopo específico (unidade) sobre override global.
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

  SELECT folga_fixa_semana INTO v_fixa
    FROM public.dp_colaboradores
   WHERE id = NEW.colaborador_id;
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

  RETURN NEW;
END;
$$;