
-- ============= ENUMS =============
DO $$ BEGIN
  CREATE TYPE public.dp_perfil_acesso AS ENUM ('colaborador','gestor','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_sindicato_tipo AS ENUM ('patronal','laboral');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_negociacao_tipo_doc AS ENUM ('act','cct','aditivo','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dp_mensagem_canal AS ENUM ('whatsapp','email','sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============= dp_colaboradores extras =============
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS folga_fixa_semana smallint CHECK (folga_fixa_semana BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS perfil_acesso public.dp_perfil_acesso NOT NULL DEFAULT 'colaborador',
  ADD COLUMN IF NOT EXISTS possui_folha_ponto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS optante_adiantamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endereco jsonb,
  ADD COLUMN IF NOT EXISTS email_contato text;

-- ============= dp_unidades extras =============
ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS possui_relogio_ponto boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tem_adiantamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_adiantamento smallint CHECK (dia_adiantamento BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS telefone text;

-- ============= dp_sindicatos.tipo =============
ALTER TABLE public.dp_sindicatos
  ADD COLUMN IF NOT EXISTS tipo public.dp_sindicato_tipo NOT NULL DEFAULT 'laboral';

-- ============= dp_sindicato_negociacoes extras =============
ALTER TABLE public.dp_sindicato_negociacoes
  ADD COLUMN IF NOT EXISTS ano smallint,
  ADD COLUMN IF NOT EXISTS mes smallint CHECK (mes BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS tipo_documento public.dp_negociacao_tipo_doc NOT NULL DEFAULT 'act',
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL;

-- ============= Junction: dp_sindicato_unidades =============
CREATE TABLE IF NOT EXISTS public.dp_sindicato_unidades (
  sindicato_id uuid NOT NULL REFERENCES public.dp_sindicatos(id) ON DELETE CASCADE,
  unidade_id  uuid NOT NULL REFERENCES public.dp_unidades(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sindicato_id, unidade_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_sindicato_unidades TO authenticated;
GRANT ALL ON public.dp_sindicato_unidades TO service_role;
ALTER TABLE public.dp_sindicato_unidades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dp_sindicato_unidades_all ON public.dp_sindicato_unidades;
CREATE POLICY dp_sindicato_unidades_all ON public.dp_sindicato_unidades
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_sindicatos s WHERE s.id = sindicato_id AND private.is_company_member(auth.uid(), s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_sindicatos s WHERE s.id = sindicato_id AND private.is_company_admin_or_owner(auth.uid(), s.company_id)));

-- ============= Junction: dp_sindicato_cargos =============
CREATE TABLE IF NOT EXISTS public.dp_sindicato_cargos (
  sindicato_id uuid NOT NULL REFERENCES public.dp_sindicatos(id) ON DELETE CASCADE,
  cargo_id    uuid NOT NULL REFERENCES public.dp_cargos(id)     ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sindicato_id, cargo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_sindicato_cargos TO authenticated;
GRANT ALL ON public.dp_sindicato_cargos TO service_role;
ALTER TABLE public.dp_sindicato_cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dp_sindicato_cargos_all ON public.dp_sindicato_cargos;
CREATE POLICY dp_sindicato_cargos_all ON public.dp_sindicato_cargos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_sindicatos s WHERE s.id = sindicato_id AND private.is_company_member(auth.uid(), s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_sindicatos s WHERE s.id = sindicato_id AND private.is_company_admin_or_owner(auth.uid(), s.company_id)));

-- ============= Junction: dp_unidade_cargos =============
CREATE TABLE IF NOT EXISTS public.dp_unidade_cargos (
  unidade_id uuid NOT NULL REFERENCES public.dp_unidades(id) ON DELETE CASCADE,
  cargo_id   uuid NOT NULL REFERENCES public.dp_cargos(id)   ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (unidade_id, cargo_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_unidade_cargos TO authenticated;
GRANT ALL ON public.dp_unidade_cargos TO service_role;
ALTER TABLE public.dp_unidade_cargos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dp_unidade_cargos_all ON public.dp_unidade_cargos;
CREATE POLICY dp_unidade_cargos_all ON public.dp_unidade_cargos
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dp_unidades u WHERE u.id = unidade_id AND private.is_company_member(auth.uid(), u.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dp_unidades u WHERE u.id = unidade_id AND private.is_company_admin_or_owner(auth.uid(), u.company_id)));

-- ============= dp_modelos_mensagem =============
CREATE TABLE IF NOT EXISTS public.dp_modelos_mensagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  corpo text NOT NULL,
  canal public.dp_mensagem_canal NOT NULL DEFAULT 'whatsapp',
  variaveis text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_modelos_mensagem TO authenticated;
GRANT ALL ON public.dp_modelos_mensagem TO service_role;
ALTER TABLE public.dp_modelos_mensagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dp_modelos_mensagem_select ON public.dp_modelos_mensagem;
CREATE POLICY dp_modelos_mensagem_select ON public.dp_modelos_mensagem
  FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id) OR is_super_admin(auth.uid()));
DROP POLICY IF EXISTS dp_modelos_mensagem_write ON public.dp_modelos_mensagem;
CREATE POLICY dp_modelos_mensagem_write ON public.dp_modelos_mensagem
  FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id) OR is_super_admin(auth.uid()))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id) OR is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS dp_modelos_mensagem_touch ON public.dp_modelos_mensagem;
CREATE TRIGGER dp_modelos_mensagem_touch
  BEFORE UPDATE ON public.dp_modelos_mensagem
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= dp_avisos anexo =============
ALTER TABLE public.dp_avisos
  ADD COLUMN IF NOT EXISTS arquivo_path text,
  ADD COLUMN IF NOT EXISTS arquivo_mime text;

-- ============= dp_registros_disciplinares pdf =============
ALTER TABLE public.dp_registros_disciplinares
  ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- ============= Restringir leitura de folha =============
-- Colaborador comum só vê os PRÓPRIOS lançamentos aprovados/pagos.
-- Admin/owner/super_admin veem tudo.
DROP POLICY IF EXISTS dp_folha_lancamentos_select ON public.dp_folha_lancamentos;
CREATE POLICY dp_folha_lancamentos_select ON public.dp_folha_lancamentos
  FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = dp_folha_lancamentos.company_id AND c.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores dc
      WHERE dc.id = dp_folha_lancamentos.colaborador_id
        AND dc.user_id = auth.uid()
        AND dp_folha_lancamentos.status = ANY (ARRAY['aprovado_dp','aprovado_financeiro','pago']::dp_folha_lancamento_status[])
    )
  );

-- ============= View pública sem CPF =============
CREATE OR REPLACE VIEW public.dp_colaboradores_public AS
SELECT
  id, company_id, user_id, nome, matricula, cargo, cargo_id,
  unidade_id, sindicato_id, regime, perfil_acesso,
  data_admissao, data_desligamento, data_nascimento,
  ativo, email_portal, telefone, whatsapp,
  folga_fixa_semana, possui_folha_ponto, optante_adiantamento,
  created_at, updated_at
FROM public.dp_colaboradores;

GRANT SELECT ON public.dp_colaboradores_public TO authenticated;
ALTER VIEW public.dp_colaboradores_public SET (security_invoker = true);
