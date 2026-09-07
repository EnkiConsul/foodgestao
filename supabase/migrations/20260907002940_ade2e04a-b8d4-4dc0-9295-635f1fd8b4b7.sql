-- 1) Importações de ficha de registro
CREATE TABLE public.dp_ficha_importacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  arquivo_path text NOT NULL,
  arquivo_nome text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  total_paginas integer NOT NULL DEFAULT 0,
  paginas_processadas integer NOT NULL DEFAULT 0,
  fichas_identificadas integer NOT NULL DEFAULT 0,
  criados integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  erro_mensagem text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  CONSTRAINT dp_ficha_importacoes_status_chk
    CHECK (status IN ('processing','ready','failed','concluida'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ficha_importacoes TO authenticated;
GRANT ALL ON public.dp_ficha_importacoes TO service_role;

ALTER TABLE public.dp_ficha_importacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_ficha_importacoes_admin_all ON public.dp_ficha_importacoes
FOR ALL TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE INDEX dp_ficha_importacoes_company_idx
  ON public.dp_ficha_importacoes (company_id, created_at DESC);

CREATE TRIGGER dp_ficha_importacoes_updated_at
BEFORE UPDATE ON public.dp_ficha_importacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Itens (uma ficha identificada dentro do PDF)
CREATE TABLE public.dp_ficha_importacao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  importacao_id uuid NOT NULL REFERENCES public.dp_ficha_importacoes(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pagina_inicio integer NOT NULL,
  pagina_fim integer NOT NULL,
  nome_extraido text,
  cpf_extraido text,
  colaborador_existente_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  colaborador_id uuid REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  dados_extraidos jsonb NOT NULL DEFAULT '{}'::jsonb,
  confianca_campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  texto_origem text,
  arquivo_path text,
  status text NOT NULL DEFAULT 'pendente',
  erro_mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_ficha_itens_status_chk
    CHECK (status IN ('pendente','revisar','duplicado','criado','atualizado','ignorado','erro'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_ficha_importacao_itens TO authenticated;
GRANT ALL ON public.dp_ficha_importacao_itens TO service_role;

ALTER TABLE public.dp_ficha_importacao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY dp_ficha_itens_admin_all ON public.dp_ficha_importacao_itens
FOR ALL TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE INDEX dp_ficha_itens_importacao_idx
  ON public.dp_ficha_importacao_itens (importacao_id, pagina_inicio);
CREATE INDEX dp_ficha_itens_company_idx
  ON public.dp_ficha_importacao_itens (company_id);

CREATE TRIGGER dp_ficha_importacao_itens_updated_at
BEFORE UPDATE ON public.dp_ficha_importacao_itens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Campos novos no cadastro do colaborador
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS rg_numero text,
  ADD COLUMN IF NOT EXISTS rg_orgao text,
  ADD COLUMN IF NOT EXISTS rg_uf text,
  ADD COLUMN IF NOT EXISTS rg_emissao date,
  ADD COLUMN IF NOT EXISTS ctps_numero text,
  ADD COLUMN IF NOT EXISTS ctps_serie text,
  ADD COLUMN IF NOT EXISTS ctps_uf text,
  ADD COLUMN IF NOT EXISTS ctps_expedicao date,
  ADD COLUMN IF NOT EXISTS titulo_eleitor text,
  ADD COLUMN IF NOT EXISTS titulo_zona text,
  ADD COLUMN IF NOT EXISTS titulo_secao text,
  ADD COLUMN IF NOT EXISTS reservista text,
  ADD COLUMN IF NOT EXISTS reservista_categoria text,
  ADD COLUMN IF NOT EXISTS nome_pai text,
  ADD COLUMN IF NOT EXISTS nome_mae text,
  ADD COLUMN IF NOT EXISTS nacionalidade text,
  ADD COLUMN IF NOT EXISTS naturalidade text,
  ADD COLUMN IF NOT EXISTS raca_cor text,
  ADD COLUMN IF NOT EXISTS grau_instrucao text,
  ADD COLUMN IF NOT EXISTS deficiencia text,
  ADD COLUMN IF NOT EXISTS origem_cadastro text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ficha_importacao_item_id uuid REFERENCES public.dp_ficha_importacao_itens(id) ON DELETE SET NULL;
