
DO $$ BEGIN CREATE TYPE public.dp_solicitacao_status AS ENUM ('pendente','aprovada','recusada','cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.dp_solicitacao_tipo AS ENUM ('folga','ferias','atestado','adiantamento','outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.dp_documento_tipo AS ENUM ('contracheque','contrato','atestado','adiantamento','ponto','disciplinar','outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.dp_regime_trabalho AS ENUM ('clt','pj','estagio','temporario','mei'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.dp_colaboradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  matricula TEXT,
  cargo TEXT,
  regime dp_regime_trabalho NOT NULL DEFAULT 'clt',
  data_admissao DATE,
  data_desligamento DATE,
  email TEXT,
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, cpf)
);
CREATE INDEX IF NOT EXISTS dp_colaboradores_company_idx ON public.dp_colaboradores(company_id);
CREATE INDEX IF NOT EXISTS dp_colaboradores_user_idx ON public.dp_colaboradores(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_colaboradores TO authenticated;
GRANT ALL ON public.dp_colaboradores TO service_role;
ALTER TABLE public.dp_colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_colab_member_read" ON public.dp_colaboradores FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "dp_colab_admin_write" ON public.dp_colaboradores FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_colaboradores.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.dp_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id UUID NOT NULL REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo dp_solicitacao_tipo NOT NULL,
  data_alvo DATE,
  data_fim DATE,
  motivo TEXT,
  status dp_solicitacao_status NOT NULL DEFAULT 'pendente',
  resposta_admin TEXT,
  respondido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  respondido_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_sol_company_idx ON public.dp_solicitacoes(company_id);
CREATE INDEX IF NOT EXISTS dp_sol_colab_idx ON public.dp_solicitacoes(colaborador_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_solicitacoes TO authenticated;
GRANT ALL ON public.dp_solicitacoes TO service_role;
ALTER TABLE public.dp_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_sol_member_read" ON public.dp_solicitacoes FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_solicitacoes.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "dp_sol_member_insert" ON public.dp_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (private.is_company_member(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_solicitacoes.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "dp_sol_admin_update" ON public.dp_solicitacoes FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_solicitacoes.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_solicitacoes.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "dp_sol_admin_delete" ON public.dp_solicitacoes FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_solicitacoes.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.dp_documentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  colaborador_id UUID REFERENCES public.dp_colaboradores(id) ON DELETE CASCADE,
  tipo dp_documento_tipo NOT NULL DEFAULT 'outros',
  titulo TEXT NOT NULL,
  descricao TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  referencia_data DATE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_doc_company_idx ON public.dp_documentos(company_id);
CREATE INDEX IF NOT EXISTS dp_doc_colab_idx ON public.dp_documentos(colaborador_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_documentos TO authenticated;
GRANT ALL ON public.dp_documentos TO service_role;
ALTER TABLE public.dp_documentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_doc_member_read" ON public.dp_documentos FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_documentos.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "dp_doc_admin_write" ON public.dp_documentos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_documentos.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_documentos.company_id AND c.user_id = auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.dp_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_dp_colab_upd ON public.dp_colaboradores;
CREATE TRIGGER trg_dp_colab_upd BEFORE UPDATE ON public.dp_colaboradores FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_sol_upd ON public.dp_solicitacoes;
CREATE TRIGGER trg_dp_sol_upd BEFORE UPDATE ON public.dp_solicitacoes FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();
DROP TRIGGER IF EXISTS trg_dp_doc_upd ON public.dp_documentos;
CREATE TRIGGER trg_dp_doc_upd BEFORE UPDATE ON public.dp_documentos FOR EACH ROW EXECUTE FUNCTION public.dp_set_updated_at();

-- Storage policies on dp-documentos bucket
DROP POLICY IF EXISTS "dp_doc_bucket_member_read" ON storage.objects;
CREATE POLICY "dp_doc_bucket_member_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dp-documentos' AND (
    private.is_company_member(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = (split_part(name, '/', 1))::uuid AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  ));

DROP POLICY IF EXISTS "dp_doc_bucket_admin_write" ON storage.objects;
CREATE POLICY "dp_doc_bucket_admin_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'dp-documentos' AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = (split_part(name, '/', 1))::uuid AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  ))
  WITH CHECK (bucket_id = 'dp-documentos' AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = (split_part(name, '/', 1))::uuid AND c.user_id = auth.uid())
    OR public.is_super_admin(auth.uid())
  ));
