
-- 1) Enum de módulos do sistema
DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM ('financeiro','dp','crm','rh','pedidos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.module_status AS ENUM ('active','trial','suspended','canceled','not_contracted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Tabela de contratação de módulos por empresa
CREATE TABLE IF NOT EXISTS public.company_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module public.app_module NOT NULL,
  status public.module_status NOT NULL DEFAULT 'not_contracted',
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, module)
);

-- 3) GRANTs (obrigatório antes do RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_modules TO authenticated;
GRANT ALL ON public.company_modules TO service_role;

-- 4) RLS
ALTER TABLE public.company_modules ENABLE ROW LEVEL SECURITY;

-- Membros da empresa podem ler os módulos contratados
CREATE POLICY "Company members can view company_modules"
  ON public.company_modules FOR SELECT
  TO authenticated
  USING (
    private.is_company_member(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = company_modules.company_id AND c.user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Apenas super_admin pode inserir/atualizar/deletar (contratação é operação de backoffice)
CREATE POLICY "Super admins can insert company_modules"
  ON public.company_modules FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update company_modules"
  ON public.company_modules FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete company_modules"
  ON public.company_modules FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 5) Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_company_modules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_modules_updated_at ON public.company_modules;
CREATE TRIGGER trg_company_modules_updated_at
BEFORE UPDATE ON public.company_modules
FOR EACH ROW EXECUTE FUNCTION public.update_company_modules_updated_at();

-- 6) Trigger de seed: toda nova empresa ganha Financeiro ativo automaticamente
CREATE OR REPLACE FUNCTION public.seed_company_modules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_modules (company_id, module, status, starts_at)
  VALUES (NEW.id, 'financeiro', 'active', now())
  ON CONFLICT (company_id, module) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_company_modules ON public.companies;
CREATE TRIGGER trg_seed_company_modules
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.seed_company_modules();

-- 7) Backfill: todas as empresas existentes recebem Financeiro ativo
INSERT INTO public.company_modules (company_id, module, status, starts_at)
SELECT id, 'financeiro', 'active', now()
FROM public.companies
ON CONFLICT (company_id, module) DO NOTHING;
