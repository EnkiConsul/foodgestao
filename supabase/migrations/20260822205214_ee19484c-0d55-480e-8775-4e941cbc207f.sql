ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'plr';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'outros_pagamentos';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'banco_horas';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'ajuste_jornada';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'termos';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'aviso_previo';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'trct';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'demonstrativo_rescisorio';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'outros_ferias';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'outros_admissao';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'outros_desligamento';
ALTER TYPE public.dp_documento_tipo ADD VALUE IF NOT EXISTS 'outros_fiscais';

ALTER TABLE public.dp_bulk_import_items ADD COLUMN IF NOT EXISTS tipo_origem TEXT;

CREATE TABLE IF NOT EXISTS public.dp_doc_tipo_aprendizado (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  assinatura TEXT NOT NULL,
  tipo public.dp_documento_tipo NOT NULL,
  origem TEXT NOT NULL DEFAULT 'manual',
  hits INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dp_doc_tipo_aprendizado_uniq UNIQUE (company_id, assinatura)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_doc_tipo_aprendizado TO authenticated;
GRANT ALL ON public.dp_doc_tipo_aprendizado TO service_role;

ALTER TABLE public.dp_doc_tipo_aprendizado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_doc_aprendizado_admin_all" ON public.dp_doc_tipo_aprendizado
FOR ALL TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_doc_tipo_aprendizado.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = dp_doc_tipo_aprendizado.company_id AND c.user_id = (SELECT auth.uid()))
  OR public.is_super_admin((SELECT auth.uid()))
);

CREATE INDEX IF NOT EXISTS dp_doc_tipo_aprendizado_company_idx ON public.dp_doc_tipo_aprendizado (company_id);