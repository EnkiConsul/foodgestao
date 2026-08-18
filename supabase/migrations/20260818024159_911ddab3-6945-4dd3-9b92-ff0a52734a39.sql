CREATE TABLE public.dp_beneficios_padroes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_beneficios_padroes TO authenticated;
GRANT ALL ON public.dp_beneficios_padroes TO service_role;

ALTER TABLE public.dp_beneficios_padroes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_beneficios_padroes_select_members" ON public.dp_beneficios_padroes
  FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));

CREATE POLICY "dp_beneficios_padroes_write_admin" ON public.dp_beneficios_padroes
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE UNIQUE INDEX dp_beneficios_padroes_company_default_uidx
  ON public.dp_beneficios_padroes (company_id) WHERE unidade_id IS NULL;
CREATE UNIQUE INDEX dp_beneficios_padroes_company_unidade_uidx
  ON public.dp_beneficios_padroes (company_id, unidade_id) WHERE unidade_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.dp_beneficios_padroes_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidade_company uuid;
BEGIN
  IF NEW.unidade_id IS NOT NULL THEN
    SELECT company_id INTO v_unidade_company FROM public.dp_unidades WHERE id = NEW.unidade_id;
    IF v_unidade_company IS NULL OR v_unidade_company <> NEW.company_id THEN
      RAISE EXCEPTION 'Unidade deve pertencer à mesma empresa do padrão informado';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER dp_beneficios_padroes_guard_trg
  BEFORE INSERT OR UPDATE ON public.dp_beneficios_padroes
  FOR EACH ROW EXECUTE FUNCTION public.dp_beneficios_padroes_guard();

CREATE TRIGGER dp_beneficios_padroes_updated_at
  BEFORE UPDATE ON public.dp_beneficios_padroes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();