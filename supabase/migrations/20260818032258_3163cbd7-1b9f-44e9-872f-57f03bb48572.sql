ALTER TABLE public.dp_beneficios_padroes
  ADD COLUMN IF NOT EXISTS cargo_id uuid NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.dp_beneficios_padroes_company_default_uidx;
DROP INDEX IF EXISTS public.dp_beneficios_padroes_company_unidade_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS dp_beneficios_padroes_escopo_uidx
  ON public.dp_beneficios_padroes (
    company_id,
    COALESCE(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cargo_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE OR REPLACE FUNCTION public.dp_beneficios_padroes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade_company uuid;
  v_cargo_company uuid;
BEGIN
  IF NEW.unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_unidade_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
    IF v_unidade_company IS NULL OR v_unidade_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Unidade deve pertencer à mesma empresa do padrão informado';
    END IF;
  END IF;
  IF NEW.cargo_id IS NOT NULL THEN
    SELECT company_id INTO v_cargo_company FROM public.dp_cargos WHERE id = NEW.cargo_id;
    IF v_cargo_company IS NULL OR v_cargo_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Cargo deve pertencer à mesma empresa do padrão informado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;