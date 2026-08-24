-- M3 (Convocações 3A.1) — dp_convocacao_grupos. Escrita RPC-only, sem grants para anon.
-- Rollback (sem dados): DROP TABLE public.dp_convocacao_grupos;

CREATE TABLE public.dp_convocacao_grupos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL,
  unidade_id uuid NOT NULL,
  competencia text NOT NULL,
  titulo text NULL,
  modalidade text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho',
  observacao text NULL,
  publicado_em timestamptz NULL,
  publicado_por uuid NULL,
  criado_por uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_dp_convocacao_grupos_id_company UNIQUE (id, company_id),
  CONSTRAINT dp_convocacao_grupos_competencia_check
    CHECK (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT dp_convocacao_grupos_modalidade_check
    CHECK (modalidade IN ('individual','aberta')),
  CONSTRAINT dp_convocacao_grupos_status_check
    CHECK (status IN ('rascunho','publicado','encerrado','cancelado')),
  CONSTRAINT fk_dp_convocacao_grupos_company
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  -- integridade multiempresa estrutural: unidade pertence à empresa
  CONSTRAINT fk_dp_convocacao_grupos_unidade_company
    FOREIGN KEY (unidade_id, company_id)
    REFERENCES public.dp_unidades(id, company_id) ON DELETE RESTRICT
);

CREATE INDEX idx_dp_conv_grupos_comp_unid_competencia
  ON public.dp_convocacao_grupos (company_id, unidade_id, competencia);
CREATE INDEX idx_dp_conv_grupos_comp_status
  ON public.dp_convocacao_grupos (company_id, status);

COMMENT ON TABLE public.dp_convocacao_grupos IS 'Lote/campanha de Convocação (grupo -> ocorrência -> oferta). Escrita apenas por RPC SECURITY DEFINER.';

-- Grants: leitura para authenticated (RLS restringe), escrita só service_role. Nada para anon.
GRANT SELECT ON public.dp_convocacao_grupos TO authenticated;
GRANT ALL ON public.dp_convocacao_grupos TO service_role;

ALTER TABLE public.dp_convocacao_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_convocacao_grupos_select_admin
  ON public.dp_convocacao_grupos FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

-- updated_at
CREATE TRIGGER trg_dp_convocacao_grupos_updated_at
  BEFORE UPDATE ON public.dp_convocacao_grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();