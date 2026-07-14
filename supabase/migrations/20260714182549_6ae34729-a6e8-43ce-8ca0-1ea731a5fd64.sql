
-- =============================================================
-- Fase 3 — Estrutura organizacional do DP 360°
-- =============================================================

-- 1) dp_unidades
CREATE TABLE public.dp_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  endereco text,
  cidade text,
  uf text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_unidades TO authenticated;
GRANT ALL ON public.dp_unidades TO service_role;
ALTER TABLE public.dp_unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_unidades_select_members" ON public.dp_unidades FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_unidades_write_admin" ON public.dp_unidades FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dp_unidades_updated_at BEFORE UPDATE ON public.dp_unidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_unidades_company ON public.dp_unidades(company_id);

-- 2) dp_cargos
CREATE TABLE public.dp_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cbo text,
  salario_base numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_cargos TO authenticated;
GRANT ALL ON public.dp_cargos TO service_role;
ALTER TABLE public.dp_cargos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_cargos_select_members" ON public.dp_cargos FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_cargos_write_admin" ON public.dp_cargos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dp_cargos_updated_at BEFORE UPDATE ON public.dp_cargos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_cargos_company ON public.dp_cargos(company_id);

-- 3) dp_sindicatos
CREATE TABLE public.dp_sindicatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text,
  data_base date,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_sindicatos TO authenticated;
GRANT ALL ON public.dp_sindicatos TO service_role;
ALTER TABLE public.dp_sindicatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dp_sindicatos_select_members" ON public.dp_sindicatos FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));
CREATE POLICY "dp_sindicatos_write_admin" ON public.dp_sindicatos FOR ALL TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE TRIGGER trg_dp_sindicatos_updated_at BEFORE UPDATE ON public.dp_sindicatos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_dp_sindicatos_company ON public.dp_sindicatos(company_id);

-- 4) Ampliar dp_colaboradores com vínculos + acesso ao portal
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cargo_id uuid REFERENCES public.dp_cargos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sindicato_id uuid REFERENCES public.dp_sindicatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dp_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS email_portal text;

CREATE INDEX IF NOT EXISTS idx_dp_colaboradores_user ON public.dp_colaboradores(user_id);
CREATE INDEX IF NOT EXISTS idx_dp_colaboradores_unidade ON public.dp_colaboradores(unidade_id);
CREATE INDEX IF NOT EXISTS idx_dp_colaboradores_cargo ON public.dp_colaboradores(cargo_id);
