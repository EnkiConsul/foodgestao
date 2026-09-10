CREATE OR REPLACE FUNCTION public.dp_regime_formalizado(p_regime public.dp_regime_trabalho)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_regime IN ('clt', 'intermitente', 'estagio', 'temporario')
$$;

CREATE OR REPLACE FUNCTION public.dp_guard_transicao_regime()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_atual public.dp_regime_trabalho;
  v_desligado DATE;
BEGIN
  IF NEW.regime IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT regime, data_desligamento INTO v_atual, v_desligado
  FROM public.dp_colaboradores
  WHERE id = NEW.colaborador_id;

  IF v_atual IS NULL OR v_desligado IS NOT NULL OR v_atual = NEW.regime THEN
    RETURN NEW;
  END IF;

  IF public.dp_regime_formalizado(v_atual)
     AND NOT public.dp_regime_formalizado(NEW.regime) THEN
    RAISE EXCEPTION 'Não é possível mudar de um vínculo com registro para um vínculo sem registro nesta tela. Faça o desligamento do contrato atual e cadastre a pessoa no novo vínculo aproveitando os dados do colaborador inativo.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_hist_condicoes_guard_regime ON public.dp_colaborador_historico_condicoes;
CREATE TRIGGER dp_hist_condicoes_guard_regime
BEFORE INSERT OR UPDATE OF regime ON public.dp_colaborador_historico_condicoes
FOR EACH ROW EXECUTE FUNCTION public.dp_guard_transicao_regime();