CREATE TABLE public.dp_colaborador_compensacao (
  colaborador_id uuid PRIMARY KEY REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  usa_banco_horas boolean,
  usa_compensa_feriados boolean,
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.dp_colaborador_compensacao IS 'Exceção individual às regras da unidade (NULL = segue a unidade).';
GRANT SELECT, INSERT, UPDATE ON public.dp_colaborador_compensacao TO authenticated;
GRANT ALL ON public.dp_colaborador_compensacao TO service_role;
ALTER TABLE public.dp_colaborador_compensacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Consulta compensacao" ON public.dp_colaborador_compensacao FOR SELECT TO authenticated
  USING (public.tem_permissao(company_id, 'dp.colaboradores', 'consulta'));
CREATE POLICY "Inclui compensacao" ON public.dp_colaborador_compensacao FOR INSERT TO authenticated
  WITH CHECK (public.tem_permissao(company_id, 'dp.colaboradores', 'alteracao')
    AND EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = colaborador_id AND c.company_id = dp_colaborador_compensacao.company_id));
CREATE POLICY "Altera compensacao" ON public.dp_colaborador_compensacao FOR UPDATE TO authenticated
  USING (public.tem_permissao(company_id, 'dp.colaboradores', 'alteracao'))
  WITH CHECK (public.tem_permissao(company_id, 'dp.colaboradores', 'alteracao')
    AND EXISTS (SELECT 1 FROM public.dp_colaboradores c WHERE c.id = colaborador_id AND c.company_id = dp_colaborador_compensacao.company_id));