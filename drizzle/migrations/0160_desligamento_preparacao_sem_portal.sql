CREATE TABLE public.dp_desligamento_preparacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL UNIQUE REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  condicoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  previsao jsonb,
  preparado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dp_desligamento_preparacoes IS 'Preparação interna do desligamento antes da conversa com o colaborador; nunca é lida pelo portal.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_desligamento_preparacoes TO authenticated;
GRANT ALL ON public.dp_desligamento_preparacoes TO service_role;
ALTER TABLE public.dp_desligamento_preparacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gestão lê preparação" ON public.dp_desligamento_preparacoes FOR SELECT TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Gestão cria preparação" ON public.dp_desligamento_preparacoes FOR INSERT TO authenticated
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id) AND EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = colaborador_id AND c.company_id = dp_desligamento_preparacoes.company_id));
CREATE POLICY "Gestão altera preparação" ON public.dp_desligamento_preparacoes FOR UPDATE TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (public.is_company_admin_or_owner(auth.uid(), company_id) AND EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = colaborador_id AND c.company_id = dp_desligamento_preparacoes.company_id));
CREATE POLICY "Gestão descarta preparação" ON public.dp_desligamento_preparacoes FOR DELETE TO authenticated
  USING (public.is_company_admin_or_owner(auth.uid(), company_id));