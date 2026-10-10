CREATE TABLE public.dp_unidade_politica_periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  politica text NOT NULL CHECK (politica IN ('relogio_ponto','banco_horas','compensa_feriados','adiantamento')),
  acao text NOT NULL CHECK (acao IN ('ativar','desativar')),
  data_efeito date NOT NULL,
  criado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dp_unid_pol_per_idx ON public.dp_unidade_politica_periodos(unidade_id, politica, data_efeito);

GRANT SELECT, INSERT ON public.dp_unidade_politica_periodos TO authenticated;
GRANT ALL ON public.dp_unidade_politica_periodos TO service_role;
ALTER TABLE public.dp_unidade_politica_periodos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_unid_pol_per_read ON public.dp_unidade_politica_periodos FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));
CREATE POLICY dp_unid_pol_per_insert ON public.dp_unidade_politica_periodos FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.dp_unidades u WHERE u.id = unidade_id AND u.company_id = dp_unidade_politica_periodos.company_id)
    AND (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR tem_permissao(company_id, 'dp.cadastros', 'alteracao') OR tem_permissao(company_id, 'dp.cadastros', 'inclusao'))
  );