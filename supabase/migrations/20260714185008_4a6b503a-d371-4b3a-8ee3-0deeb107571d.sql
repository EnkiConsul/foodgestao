
CREATE TABLE public.dp_sindicato_negociacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sindicato_id uuid NOT NULL REFERENCES public.dp_sindicatos(id) ON DELETE CASCADE,
  data_base date NOT NULL,
  reajuste_pct numeric(6,3),
  clausulas jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  pdf_path text,
  vigencia_inicio date NOT NULL,
  vigencia_fim date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_sindicato_negociacoes TO authenticated;
GRANT ALL ON public.dp_sindicato_negociacoes TO service_role;

ALTER TABLE public.dp_sindicato_negociacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read dp_sindicato_negociacoes"
  ON public.dp_sindicato_negociacoes FOR SELECT
  TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "Admins manage dp_sindicato_negociacoes"
  ON public.dp_sindicato_negociacoes FOR ALL
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE INDEX idx_dp_sind_neg_company ON public.dp_sindicato_negociacoes(company_id);
CREATE INDEX idx_dp_sind_neg_sindicato ON public.dp_sindicato_negociacoes(sindicato_id);

CREATE TRIGGER trg_dp_sind_neg_updated_at
  BEFORE UPDATE ON public.dp_sindicato_negociacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
