CREATE TABLE public.dp_salario_familia_tabelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vigencia_inicio date NOT NULL,
  cota numeric(12,2) NOT NULL CHECK (cota > 0),
  teto numeric(12,2) NOT NULL CHECK (teto > 0),
  criado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  removido_em timestamptz
);
CREATE UNIQUE INDEX dp_sf_tabelas_inicio_uniq ON public.dp_salario_familia_tabelas(company_id, vigencia_inicio) WHERE removido_em IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.dp_salario_familia_tabelas TO authenticated;
GRANT ALL ON public.dp_salario_familia_tabelas TO service_role;
ALTER TABLE public.dp_salario_familia_tabelas ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_sf_tabelas_read ON public.dp_salario_familia_tabelas FOR SELECT TO authenticated
  USING (private.is_company_member((SELECT auth.uid()), company_id));
CREATE POLICY dp_sf_tabelas_insert ON public.dp_salario_familia_tabelas FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR tem_permissao(company_id, 'dp.cadastros', 'inclusao'));
CREATE POLICY dp_sf_tabelas_update ON public.dp_salario_familia_tabelas FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR tem_permissao(company_id, 'dp.cadastros', 'alteracao'))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id) OR tem_permissao(company_id, 'dp.cadastros', 'alteracao'));

INSERT INTO public.dp_salario_familia_tabelas (company_id, vigencia_inicio, cota, teto, criado_por, created_at)
SELECT company_id, salario_familia_vigencia, salario_familia_cota, salario_familia_teto, NULL, now()
FROM public.dp_config_dp
WHERE unidade_id IS NULL AND salario_familia_vigencia IS NOT NULL
  AND salario_familia_cota > 0 AND salario_familia_teto > 0;