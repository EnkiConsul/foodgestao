ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS modo_domingo text NOT NULL DEFAULT 'legislacao';

ALTER TABLE public.dp_config_dp
  DROP CONSTRAINT IF EXISTS dp_config_dp_modo_domingo_check;

ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT dp_config_dp_modo_domingo_check
  CHECK (modo_domingo IN ('legislacao', 'tres_semanas', 'sete_semanas', 'personalizado'));

-- Deriva o modo a partir dos valores já configurados
UPDATE public.dp_config_dp
SET modo_domingo = CASE
  WHEN periodicidade_domingo = 3 AND setor_comercio THEN 'legislacao'
  WHEN periodicidade_domingo = 3 THEN 'tres_semanas'
  WHEN periodicidade_domingo = 7 AND NOT setor_comercio THEN 'legislacao'
  WHEN periodicidade_domingo = 7 THEN 'sete_semanas'
  ELSE 'personalizado'
END;

-- O modo "7 semanas" exige acordo/convenção vinculada ou ciência registrada
CREATE OR REPLACE FUNCTION public.dp_config_dp_validar_modo_domingo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.modo_domingo = 'sete_semanas'
     AND NEW.negociacao_id IS NULL
     AND COALESCE(NEW.setor_comercio, false) THEN
    RAISE EXCEPTION 'O modo de 7 semanas em empresa do comércio exige vínculo com acordo/convenção coletiva.';
  END IF;

  IF NEW.modo_domingo = 'legislacao' THEN
    NEW.periodicidade_domingo := CASE WHEN NEW.setor_comercio THEN 3 ELSE 7 END;
  ELSIF NEW.modo_domingo = 'tres_semanas' THEN
    NEW.periodicidade_domingo := 3;
  ELSIF NEW.modo_domingo = 'sete_semanas' THEN
    NEW.periodicidade_domingo := 7;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dp_config_dp_validar_modo_domingo_trg ON public.dp_config_dp;
CREATE TRIGGER dp_config_dp_validar_modo_domingo_trg
  BEFORE INSERT OR UPDATE ON public.dp_config_dp
  FOR EACH ROW EXECUTE FUNCTION public.dp_config_dp_validar_modo_domingo();