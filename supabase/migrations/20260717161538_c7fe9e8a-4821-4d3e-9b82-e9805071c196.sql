
-- Enum para status de aprovação de cadastro
DO $$ BEGIN
  CREATE TYPE public.dp_aprovacao_status AS ENUM ('pendente','aprovado','recusado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Adiciona coluna aprovacao_status em dp_colaboradores
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS aprovacao_status public.dp_aprovacao_status NOT NULL DEFAULT 'aprovado';

-- Todos os registros existentes ficam como aprovados (default). Novos auto-cadastros virão como 'pendente'.

-- Tabela para receber solicitações de cadastro público (sem exigir auth.users pré-existente)
CREATE TABLE IF NOT EXISTS public.dp_cadastro_solicitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cpf TEXT NOT NULL,
  cargo TEXT,
  email TEXT,
  telefone TEXT,
  data_nascimento DATE,
  observacoes TEXT,
  status public.dp_aprovacao_status NOT NULL DEFAULT 'pendente',
  motivo_recusa TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_cadastro_solicitacoes TO authenticated;
GRANT INSERT ON public.dp_cadastro_solicitacoes TO anon;
GRANT ALL ON public.dp_cadastro_solicitacoes TO service_role;

ALTER TABLE public.dp_cadastro_solicitacoes ENABLE ROW LEVEL SECURITY;

-- Anon/authenticated podem criar solicitação (auto-cadastro público)
CREATE POLICY "public_can_create_cadastro" ON public.dp_cadastro_solicitacoes
  FOR INSERT TO anon, authenticated
  WITH CHECK (status = 'pendente');

-- Admins da empresa podem ver e gerenciar
CREATE POLICY "company_admins_manage_cadastro" ON public.dp_cadastro_solicitacoes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = dp_cadastro_solicitacoes.company_id
        AND cm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = dp_cadastro_solicitacoes.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_dp_cadastro_solic_status ON public.dp_cadastro_solicitacoes(company_id, status, created_at DESC);

CREATE TRIGGER trg_dp_cadastro_solic_updated_at
  BEFORE UPDATE ON public.dp_cadastro_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
