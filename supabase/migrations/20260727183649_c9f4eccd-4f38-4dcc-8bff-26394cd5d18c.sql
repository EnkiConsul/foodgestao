CREATE OR REPLACE FUNCTION public.dp_convocacao_sync_escala()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comp text;
  v_escala_id uuid;
  v_item_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'aceita' AND OLD.status IS DISTINCT FROM 'aceita' THEN
    v_comp := to_char(NEW.data, 'YYYY-MM');

    SELECT id INTO v_escala_id
    FROM public.dp_escalas
    WHERE company_id = NEW.company_id
      AND competencia = v_comp
      AND unidade_id IS NOT DISTINCT FROM NEW.unidade_id
    LIMIT 1;

    IF v_escala_id IS NULL THEN
      INSERT INTO public.dp_escalas (company_id, unidade_id, competencia, status)
      VALUES (NEW.company_id, NEW.unidade_id, v_comp, 'rascunho')
      RETURNING id INTO v_escala_id;
    END IF;

    SELECT id INTO v_item_id
    FROM public.dp_escala_itens
    WHERE escala_id = v_escala_id
      AND colaborador_id = NEW.colaborador_id
      AND data = NEW.data
    LIMIT 1;

    IF v_item_id IS NULL THEN
      INSERT INTO public.dp_escala_itens (
        company_id, escala_id, colaborador_id, data, tipo, turno_id,
        entrada, saida, intervalo_minutos, termina_no_dia_seguinte,
        carga_prevista_horas, origem, observacao
      ) VALUES (
        NEW.company_id, v_escala_id, NEW.colaborador_id, NEW.data, 'trabalho', NEW.turno_id,
        NEW.entrada, NEW.saida, NEW.intervalo_minutos, NEW.termina_no_dia_seguinte,
        NEW.carga_prevista_horas, 'convocacao', NEW.observacao
      )
      RETURNING id INTO v_item_id;
    ELSE
      UPDATE public.dp_escala_itens
      SET tipo = 'trabalho',
          turno_id = NEW.turno_id,
          entrada = NEW.entrada,
          saida = NEW.saida,
          intervalo_minutos = NEW.intervalo_minutos,
          termina_no_dia_seguinte = NEW.termina_no_dia_seguinte,
          carga_prevista_horas = NEW.carga_prevista_horas,
          origem = 'convocacao'
      WHERE id = v_item_id;
    END IF;

    NEW.escala_item_id := v_item_id;

  ELSIF TG_OP = 'UPDATE'
        AND OLD.status = 'aceita'
        AND NEW.status IN ('recusada','cancelada','expirada')
        AND OLD.escala_item_id IS NOT NULL THEN
    DELETE FROM public.dp_escala_itens
    WHERE id = OLD.escala_item_id AND origem = 'convocacao';
    NEW.escala_item_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_convocacao_sync_escala ON public.dp_convocacoes;
CREATE TRIGGER trg_dp_convocacao_sync_escala
  BEFORE UPDATE ON public.dp_convocacoes
  FOR EACH ROW EXECUTE FUNCTION public.dp_convocacao_sync_escala();