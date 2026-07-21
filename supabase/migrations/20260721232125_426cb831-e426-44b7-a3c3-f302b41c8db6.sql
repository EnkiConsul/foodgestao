
CREATE OR REPLACE FUNCTION public.dp_validar_solicitacao_folga()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_unidade_id uuid;
  v_limite int;
  v_qtd int;
  v_bloqueada boolean;
  v_bloq_individual boolean;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'folga' THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelada' OR NEW.status = 'recusada' THEN RETURN NEW; END IF;
  IF NEW.data_alvo IS NULL THEN RETURN NEW; END IF;

  SELECT unidade_id INTO v_unidade_id
    FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas b
    WHERE b.company_id = NEW.company_id
      AND b.data = NEW.data_alvo
      AND (b.unidade_id IS NULL OR b.unidade_id = v_unidade_id)
      AND b.liberada_por_solicitacao IS NULL
  ) INTO v_bloqueada;
  IF v_bloqueada THEN
    RAISE EXCEPTION 'Data % está bloqueada para folgas nesta empresa/unidade', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.dp_bloqueios bl
    WHERE bl.company_id = NEW.company_id
      AND bl.colaborador_id = NEW.colaborador_id
      AND bl.ativo = true
      AND bl.tipo IN ('folga','todos')
      AND bl.inicio <= NEW.data_alvo
      AND (bl.fim IS NULL OR bl.fim >= NEW.data_alvo)
  ) INTO v_bloq_individual;
  IF v_bloq_individual THEN
    RAISE EXCEPTION 'Você está bloqueado para marcar folga em %', NEW.data_alvo
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT limite_folgas INTO v_limite
    FROM public.dp_dia_config
   WHERE company_id = NEW.company_id
     AND data = NEW.data_alvo
     AND (unidade_id = v_unidade_id OR unidade_id IS NULL)
   ORDER BY (unidade_id IS NOT NULL) DESC
   LIMIT 1;

  IF v_limite IS NOT NULL AND v_limite > 0 THEN
    SELECT
      (
        SELECT COUNT(*) FROM public.dp_folgas f
         WHERE f.company_id = NEW.company_id
           AND f.data = NEW.data_alvo
           AND f.status <> 'cancelada'
           AND f.extra = false
           AND f.tipo NOT IN ('ferias','licenca')
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c2
                WHERE c2.id = f.colaborador_id AND c2.unidade_id = v_unidade_id
             ))
      ) + (
        SELECT COUNT(*) FROM public.dp_solicitacoes s
         WHERE s.company_id = NEW.company_id
           AND s.data_alvo = NEW.data_alvo
           AND s.tipo = 'folga'
           AND s.status = 'pendente'
           AND s.colaborador_id <> NEW.colaborador_id
           AND (v_unidade_id IS NULL OR EXISTS (
               SELECT 1 FROM public.dp_colaboradores c3
                WHERE c3.id = s.colaborador_id AND c3.unidade_id = v_unidade_id
             ))
      )
    INTO v_qtd;

    IF v_qtd >= v_limite THEN
      RAISE EXCEPTION 'Data % indisponível. Limite de folgas atingido (% de %)', NEW.data_alvo, v_qtd, v_limite
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS dp_solicitacoes_validar ON public.dp_solicitacoes;
CREATE TRIGGER dp_solicitacoes_validar
  BEFORE INSERT ON public.dp_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_validar_solicitacao_folga();
