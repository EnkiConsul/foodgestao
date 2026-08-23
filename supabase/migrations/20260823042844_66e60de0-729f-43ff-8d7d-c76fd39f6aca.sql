ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS domingos_folga_mes smallint;

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_domingos_folga_mes_check;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_domingos_folga_mes_check
  CHECK (domingos_folga_mes IS NULL OR domingos_folga_mes IN (1, 2));

CREATE OR REPLACE FUNCTION public.dp_colab_valida_domingos_folga()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Gênero informado como F/M segue a regra da unidade: o override não se aplica.
  IF NEW.sexo IN ('F', 'M') THEN
    NEW.domingos_folga_mes := NULL;
    RETURN NEW;
  END IF;

  -- Demais casos (outro / não informado) exigem a frequência CLT no cadastro CLT.
  IF NEW.sexo IS NOT NULL AND NEW.regime = 'clt' AND NEW.domingos_folga_mes IS NULL THEN
    RAISE EXCEPTION 'Informe a quantidade de folgas dominicais por mês (1 ou 2) para este colaborador';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_colab_valida_domingos_folga_trg ON public.dp_colaboradores;
CREATE TRIGGER dp_colab_valida_domingos_folga_trg
  BEFORE INSERT OR UPDATE ON public.dp_colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.dp_colab_valida_domingos_folga();