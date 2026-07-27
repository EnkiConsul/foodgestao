CREATE TABLE public.dp_colaborador_config_trabalho (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  turno_padrao_id uuid REFERENCES public.dp_turnos(id) ON DELETE RESTRICT,
  carga_semanal_horas numeric(5,2),
  folga_variavel boolean NOT NULL DEFAULT false,
  folga_fixa_dow smallint,
  observacoes text,
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_cct_periodo_valido CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio),
  CONSTRAINT dp_cct_dow CHECK (folga_fixa_dow IS NULL OR (folga_fixa_dow >= 0 AND folga_fixa_dow <= 6)),
  CONSTRAINT dp_cct_folga_coerente CHECK (NOT (folga_variavel AND folga_fixa_dow IS NOT NULL))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_config_trabalho TO authenticated;
GRANT ALL ON public.dp_colaborador_config_trabalho TO service_role;
ALTER TABLE public.dp_colaborador_config_trabalho ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_dp_cct_vigente ON public.dp_colaborador_config_trabalho (colaborador_id) WHERE vigencia_fim IS NULL;
CREATE INDEX idx_dp_cct_company ON public.dp_colaborador_config_trabalho (company_id, colaborador_id);
CREATE INDEX idx_dp_cct_unidade ON public.dp_colaborador_config_trabalho (unidade_id);

CREATE POLICY "dp_cct_admin_write" ON public.dp_colaborador_config_trabalho
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_cct_read_member" ON public.dp_colaborador_config_trabalho FOR SELECT
  TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_cct_read_self" ON public.dp_colaborador_config_trabalho FOR SELECT
  TO authenticated
  USING (public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL AND colaborador_id = public.dp_colaborador_ativo_of(auth.uid()));

CREATE TRIGGER dp_cct_upd BEFORE UPDATE ON public.dp_colaborador_config_trabalho
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

CREATE TABLE public.dp_colaborador_config_dias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  config_id uuid NOT NULL REFERENCES public.dp_colaborador_config_trabalho(id) ON DELETE CASCADE,
  dow smallint NOT NULL,
  trabalha boolean NOT NULL DEFAULT true,
  turno_id uuid REFERENCES public.dp_turnos(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ccd_dow CHECK (dow >= 0 AND dow <= 6),
  CONSTRAINT dp_ccd_unico UNIQUE (config_id, dow)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_config_dias TO authenticated;
GRANT ALL ON public.dp_colaborador_config_dias TO service_role;
ALTER TABLE public.dp_colaborador_config_dias ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_dp_ccd_config ON public.dp_colaborador_config_dias (config_id);

CREATE POLICY "dp_ccd_admin_write" ON public.dp_colaborador_config_dias
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY "dp_ccd_read_member" ON public.dp_colaborador_config_dias FOR SELECT
  TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

CREATE POLICY "dp_ccd_read_self" ON public.dp_colaborador_config_dias FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_colaborador_config_trabalho c
    WHERE c.id = config_id
      AND public.dp_colaborador_ativo_of(auth.uid()) IS NOT NULL
      AND c.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
  ));

CREATE TRIGGER dp_ccd_upd BEFORE UPDATE ON public.dp_colaborador_config_dias
  FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();