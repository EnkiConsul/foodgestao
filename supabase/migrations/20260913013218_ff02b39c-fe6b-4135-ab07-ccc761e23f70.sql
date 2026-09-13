CREATE OR REPLACE FUNCTION public.dp_bloquear_durante_ferias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_ferias record;
BEGIN
  -- Cada tabela tem formato próprio: checar campos só quando existem nela.
  IF TG_TABLE_NAME = 'dp_escala_itens' THEN
    -- itens de escala marcados como férias/afastamento são o próprio registro do período
    IF NEW.tipo::text IN ('ferias', 'afastamento') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_folgas' THEN
    IF NEW.status::text = 'cancelada' THEN
      RETURN NEW;
    END IF;
  ELSIF TG_TABLE_NAME = 'dp_convocacoes' THEN
    IF NEW.status::text NOT IN ('pendente', 'aceita') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT * INTO v_ferias
  FROM public.dp_ferias_em_curso(NEW.colaborador_id, NEW.data);

  IF v_ferias.gozo_id IS NOT NULL THEN
    RAISE EXCEPTION 'FERIAS_COLABORADOR_EM_FERIAS:%:%',
      to_char(v_ferias.data_inicio, 'DD/MM/YYYY'), to_char(v_ferias.data_fim, 'DD/MM/YYYY');
  END IF;

  RETURN NEW;
END;
$fn$;