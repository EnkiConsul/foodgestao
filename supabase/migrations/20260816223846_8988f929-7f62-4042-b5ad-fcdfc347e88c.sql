-- Piso do cargo por sindicato patronal + ajuste opcional por unidade
ALTER TABLE public.dp_cargo_salarios
  ALTER COLUMN unidade_id DROP NOT NULL;

-- Preenche o patronal a partir do vínculo da unidade, quando existir
UPDATE public.dp_cargo_salarios cs
SET sindicato_patronal_id = sub.sindicato_id
FROM (
  SELECT su.unidade_id, MIN(su.sindicato_id::text)::uuid AS sindicato_id
  FROM public.dp_sindicato_unidades su
  JOIN public.dp_sindicatos s ON s.id = su.sindicato_id AND s.tipo = 'patronal'
  GROUP BY su.unidade_id
) sub
WHERE cs.sindicato_patronal_id IS NULL AND cs.unidade_id = sub.unidade_id;

ALTER TABLE public.dp_cargo_salarios
  ADD CONSTRAINT dp_cargo_salarios_escopo_chk
  CHECK (unidade_id IS NOT NULL OR sindicato_patronal_id IS NOT NULL);

DROP INDEX IF EXISTS public.dp_cargo_salarios_vigente_uniq;

CREATE UNIQUE INDEX dp_cargo_salarios_unidade_vigente_uniq
  ON public.dp_cargo_salarios (cargo_id, unidade_id)
  WHERE vigencia_fim IS NULL AND unidade_id IS NOT NULL;

CREATE UNIQUE INDEX dp_cargo_salarios_patronal_vigente_uniq
  ON public.dp_cargo_salarios (cargo_id, sindicato_patronal_id)
  WHERE vigencia_fim IS NULL AND unidade_id IS NULL;

CREATE INDEX dp_cargo_salarios_patronal_idx
  ON public.dp_cargo_salarios (cargo_id, sindicato_patronal_id, vigencia_inicio DESC);

CREATE OR REPLACE FUNCTION public.dp_cargo_salarios_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo_company uuid;
  v_unidade_company uuid;
  v_sind_company uuid;
BEGIN
  SELECT company_id INTO v_cargo_company FROM public.dp_cargos WHERE id = NEW.cargo_id;
  IF v_cargo_company IS NULL OR v_cargo_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Cargo deve pertencer à mesma empresa do salário informado';
  END IF;

  IF NEW.unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_unidade_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
    IF v_unidade_company IS NULL OR v_unidade_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Unidade deve pertencer à mesma empresa do salário informado';
    END IF;
  END IF;

  IF NEW.sindicato_patronal_id IS NOT NULL THEN
    SELECT company_id INTO v_sind_company FROM public.dp_sindicatos WHERE id = NEW.sindicato_patronal_id;
    IF v_sind_company IS NULL OR v_sind_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Sindicato deve pertencer à mesma empresa do salário informado';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;