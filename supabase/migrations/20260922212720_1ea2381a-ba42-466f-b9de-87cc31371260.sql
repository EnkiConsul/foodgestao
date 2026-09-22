-- Adiantamento salarial: a opção acompanha o vínculo.
-- Encerra automaticamente no desligamento e não é herdada na recontratação.

CREATE OR REPLACE FUNCTION public.dp_adiantamento_encerrar_no_vinculo(
  p_colaborador uuid,
  p_data_fim date,
  p_motivo text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_dia int;
  v_pagamento date;
  v_competencia text;
  v_id uuid;
  v_ativo boolean;
BEGIN
  IF p_colaborador IS NULL OR p_data_fim IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.company_id, u.dia_adiantamento
    INTO v_company, v_dia
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = p_colaborador;
  IF v_company IS NULL THEN
    RETURN NULL;
  END IF;

  -- A opção estava ativa na competência do fim do vínculo?
  SELECT (s.tipo = 'ativar') INTO v_ativo
    FROM public.dp_adiantamento_solicitacoes s
   WHERE s.colaborador_id = p_colaborador
     AND s.competencia_efeito <= to_char(p_data_fim, 'YYYY-MM')
   ORDER BY s.competencia_efeito DESC, s.created_at DESC
   LIMIT 1;
  IF COALESCE(v_ativo, false) = false THEN
    RETURN NULL;
  END IF;

  -- Idempotência: já existe o encerramento nessa data?
  SELECT s.id INTO v_id
    FROM public.dp_adiantamento_solicitacoes s
   WHERE s.colaborador_id = p_colaborador
     AND s.tipo = 'cancelar'
     AND s.data_solicitacao = p_data_fim
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- O encerramento vale a partir da competência seguinte ao fim do vínculo:
  -- a competência do próprio desligamento continua válida (havia vínculo nela).
  v_competencia := to_char((p_data_fim + INTERVAL '1 month'), 'YYYY-MM');

  INSERT INTO public.dp_adiantamento_solicitacoes
    (company_id, colaborador_id, tipo, data_solicitacao, competencia_efeito, origem, observacao, criado_por)
  VALUES
    (v_company, p_colaborador, 'cancelar', p_data_fim, v_competencia, 'gestor', p_motivo, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_adiantamento_encerrar_no_vinculo(uuid, date, text) FROM PUBLIC;

-- 1) Desligamento registrado na ficha.
CREATE OR REPLACE FUNCTION public.dp_adiantamento_encerrar_no_desligamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.data_desligamento IS NOT NULL
     AND (OLD.data_desligamento IS NULL OR OLD.data_desligamento <> NEW.data_desligamento) THEN
    PERFORM public.dp_adiantamento_encerrar_no_vinculo(
      NEW.id, NEW.data_desligamento, 'Encerrado automaticamente com o desligamento.'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_adiantamento_encerrar_no_desligamento ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_adiantamento_encerrar_no_desligamento
AFTER UPDATE OF data_desligamento ON public.dp_colaboradores
FOR EACH ROW EXECUTE FUNCTION public.dp_adiantamento_encerrar_no_desligamento();

-- 2) Novo vínculo (recontratação) no mesmo cadastro: não herda a opção.
CREATE OR REPLACE FUNCTION public.dp_adiantamento_encerrar_no_novo_vinculo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fim date;
BEGIN
  IF COALESCE(NEW.modo_continuidade::text, '') <> 'novo_contrato' THEN
    RETURN NEW;
  END IF;

  SELECT h.vigencia_fim INTO v_fim
    FROM public.dp_colaborador_historico_condicoes h
   WHERE h.colaborador_id = NEW.colaborador_id
     AND h.id <> NEW.id
     AND h.vigencia_fim IS NOT NULL
     AND h.vigencia_fim < NEW.vigencia_inicio
   ORDER BY h.vigencia_fim DESC
   LIMIT 1;

  IF v_fim IS NULL THEN
    v_fim := NEW.vigencia_inicio - 1;
  END IF;

  PERFORM public.dp_adiantamento_encerrar_no_vinculo(
    NEW.colaborador_id, v_fim, 'Encerrado automaticamente no fim do vínculo anterior.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_adiantamento_encerrar_no_novo_vinculo ON public.dp_colaborador_historico_condicoes;
CREATE TRIGGER trg_dp_adiantamento_encerrar_no_novo_vinculo
AFTER INSERT ON public.dp_colaborador_historico_condicoes
FOR EACH ROW EXECUTE FUNCTION public.dp_adiantamento_encerrar_no_novo_vinculo();