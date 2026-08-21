ALTER TABLE public.dp_beneficios
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS dp_beneficios_escopo_idx
  ON public.dp_beneficios (company_id, unidade_id, cargo_id);