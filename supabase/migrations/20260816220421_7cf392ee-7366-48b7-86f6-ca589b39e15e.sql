CREATE TABLE public.dp_cargo_salarios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cargo_id uuid NOT NULL REFERENCES public.dp_cargos(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  salario_base numeric(12,2) NOT NULL CHECK (salario_base > 0),
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date,
  sindicato_patronal_id uuid REFERENCES public.dp_sindicatos(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_cargo_salarios TO authenticated;
GRANT ALL ON public.dp_cargo_salarios TO service_role;

ALTER TABLE public.dp_cargo_salarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_cargo_salarios_select_members ON public.dp_cargo_salarios
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY dp_cargo_salarios_write_admin ON public.dp_cargo_salarios
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE UNIQUE INDEX dp_cargo_salarios_vigente_uniq
  ON public.dp_cargo_salarios (cargo_id, unidade_id)
  WHERE vigencia_fim IS NULL;

CREATE INDEX dp_cargo_salarios_cargo_idx ON public.dp_cargo_salarios (cargo_id, unidade_id, vigencia_inicio DESC);

CREATE TRIGGER dp_cargo_salarios_updated_at
  BEFORE UPDATE ON public.dp_cargo_salarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.dp_cargo_salarios_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo_company uuid;
  v_unidade_company uuid;
BEGIN
  SELECT company_id INTO v_cargo_company FROM public.dp_cargos WHERE id = NEW.cargo_id;
  SELECT company_id INTO v_unidade_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
  IF v_cargo_company IS NULL OR v_unidade_company IS NULL
     OR v_cargo_company <> NEW.company_id OR v_unidade_company <> NEW.company_id THEN
    RAISE EXCEPTION 'Cargo e unidade devem pertencer à mesma empresa do salário informado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_cargo_salarios_guard_trg
  BEFORE INSERT OR UPDATE ON public.dp_cargo_salarios
  FOR EACH ROW EXECUTE FUNCTION public.dp_cargo_salarios_guard();