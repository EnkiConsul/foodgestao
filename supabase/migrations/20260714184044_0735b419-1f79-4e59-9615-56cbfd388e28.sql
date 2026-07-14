
DO $$ BEGIN
  CREATE TYPE public.dp_troca_status AS ENUM ('pendente_colega','pendente_gestor','aprovada','recusada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.dp_trocas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  solicitante_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  destino_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  data_original date NOT NULL,
  data_proposta date NOT NULL,
  motivo text NOT NULL,
  status public.dp_troca_status NOT NULL DEFAULT 'pendente_colega',
  colega_resposta text,
  colega_respondido_em timestamptz,
  gestor_resposta text,
  gestor_respondido_em timestamptz,
  gestor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_trocas TO authenticated;
GRANT ALL ON public.dp_trocas TO service_role;
ALTER TABLE public.dp_trocas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_trocas_read" ON public.dp_trocas FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_trocas_write" ON public.dp_trocas FOR ALL TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER dp_trocas_upd BEFORE UPDATE ON public.dp_trocas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_trocas_company ON public.dp_trocas(company_id, status, data_original);
