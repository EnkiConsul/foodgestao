-- 1) Catálogo de requisitos por empresa
CREATE TABLE IF NOT EXISTS public.dp_documento_requisitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL,
  descricao text,
  categoria text NOT NULL DEFAULT 'admissao',
  obrigatoriedade text NOT NULL DEFAULT 'obrigatorio',
  aplica_a text NOT NULL DEFAULT 'todos',
  tipo_documento public.dp_documento_tipo NOT NULL DEFAULT 'admissao',
  periodicidade text NOT NULL DEFAULT 'unica',
  meses_validade integer,
  dias_aviso integer NOT NULL DEFAULT 30,
  gerado_pelo_sistema boolean NOT NULL DEFAULT false,
  exige_aceite boolean NOT NULL DEFAULT false,
  satisfeito_por text,
  sistema boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_doc_req_obrig_chk CHECK (obrigatoriedade IN ('obrigatorio','opcional','desativado')),
  CONSTRAINT dp_doc_req_period_chk CHECK (periodicidade IN ('unica','anual','semestral','vencimento')),
  CONSTRAINT dp_doc_req_categoria_chk CHECK (categoria IN ('admissao','situacao','cargo_dirige','veiculo','regime','dependente')),
  CONSTRAINT dp_doc_req_aplica_chk CHECK (aplica_a IN ('todos','cargo_dirige','veiculo_proprio','veiculo_empresa','menor','regime_pj','regime_clt','estado_civil_casado','exige_epi','dependente','dependente_ate_7','dependente_acima_7','dependente_invalido')),
  CONSTRAINT dp_doc_req_codigo_uk UNIQUE (company_id, codigo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_documento_requisitos TO authenticated;
GRANT ALL ON public.dp_documento_requisitos TO service_role;
ALTER TABLE public.dp_documento_requisitos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_doc_req_admin_all ON public.dp_documento_requisitos
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_doc_req_colab_read ON public.dp_documento_requisitos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.company_id = dp_documento_requisitos.company_id
      AND c.id = public.dp_colaborador_of((SELECT auth.uid()))
  ));

CREATE TRIGGER dp_documento_requisitos_updated_at
  BEFORE UPDATE ON public.dp_documento_requisitos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Vínculo requisito x colaborador/dependente
CREATE TABLE IF NOT EXISTS public.dp_colaborador_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  dependente_id uuid REFERENCES public.dp_dependentes(id) ON DELETE CASCADE,
  requisito_id uuid NOT NULL REFERENCES public.dp_documento_requisitos(id) ON DELETE CASCADE,
  documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'enviado',
  validade date,
  dispensado boolean NOT NULL DEFAULT false,
  motivo_dispensa text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_colab_doc_status_chk CHECK (status IN ('enviado','aprovado','recusado','dispensado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dp_colab_doc_uk
  ON public.dp_colaborador_documentos (requisito_id, colaborador_id, COALESCE(dependente_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS dp_colab_doc_colab_idx ON public.dp_colaborador_documentos (colaborador_id);
CREATE INDEX IF NOT EXISTS dp_colab_doc_company_idx ON public.dp_colaborador_documentos (company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaborador_documentos TO authenticated;
GRANT ALL ON public.dp_colaborador_documentos TO service_role;
ALTER TABLE public.dp_colaborador_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_colab_doc_admin_all ON public.dp_colaborador_documentos
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id))
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_colab_doc_self_read ON public.dp_colaborador_documentos
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_of((SELECT auth.uid())));

CREATE POLICY dp_colab_doc_self_insert ON public.dp_colaborador_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
    AND status = 'enviado'
    AND dispensado = false
    AND EXISTS (SELECT 1 FROM public.dp_colaboradores c
                WHERE c.id = dp_colaborador_documentos.colaborador_id
                  AND c.company_id = dp_colaborador_documentos.company_id)
  );

CREATE TRIGGER dp_colaborador_documentos_updated_at
  BEFORE UPDATE ON public.dp_colaborador_documentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Aceites eletrônicos (imutáveis)
CREATE TABLE IF NOT EXISTS public.dp_documento_aceites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  requisito_id uuid REFERENCES public.dp_documento_requisitos(id) ON DELETE SET NULL,
  documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  modelo text NOT NULL,
  modelo_versao text NOT NULL DEFAULT 'v1',
  conteudo_hash text NOT NULL,
  aceito_por uuid,
  aceito_em timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS dp_doc_aceites_colab_idx ON public.dp_documento_aceites (colaborador_id);

GRANT SELECT, INSERT ON public.dp_documento_aceites TO authenticated;
GRANT ALL ON public.dp_documento_aceites TO service_role;
ALTER TABLE public.dp_documento_aceites ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_doc_aceites_admin_read ON public.dp_documento_aceites
  FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));

CREATE POLICY dp_doc_aceites_self_read ON public.dp_documento_aceites
  FOR SELECT TO authenticated
  USING (colaborador_id = public.dp_colaborador_of((SELECT auth.uid())));

CREATE POLICY dp_doc_aceites_self_insert ON public.dp_documento_aceites
  FOR INSERT TO authenticated
  WITH CHECK (
    colaborador_id = public.dp_colaborador_ativo_of((SELECT auth.uid()))
    AND aceito_por = (SELECT auth.uid())
  );

CREATE POLICY dp_doc_aceites_admin_insert ON public.dp_documento_aceites
  FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner((SELECT auth.uid()), company_id));