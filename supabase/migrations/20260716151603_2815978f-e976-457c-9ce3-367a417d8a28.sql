
-- =========================================================
-- BULK IMPORT BATCHES
-- =========================================================
CREATE TABLE public.dp_bulk_import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo public.dp_documento_tipo NOT NULL DEFAULT 'outros',
  source_file_path TEXT NOT NULL,
  source_file_name TEXT,
  referencia_data DATE,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','ready','partially_imported','imported','failed')),
  total_pages INT NOT NULL DEFAULT 0,
  matched_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bulk_import_batches TO authenticated;
GRANT ALL ON public.dp_bulk_import_batches TO service_role;
ALTER TABLE public.dp_bulk_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_bulk_batch_admin_all" ON public.dp_bulk_import_batches
  FOR ALL TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = dp_bulk_import_batches.company_id AND c.user_id = auth.uid())
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = dp_bulk_import_batches.company_id AND c.user_id = auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE INDEX dp_bulk_batch_company_idx ON public.dp_bulk_import_batches(company_id, created_at DESC);

CREATE TRIGGER trg_dp_bulk_batches_updated_at
  BEFORE UPDATE ON public.dp_bulk_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- BULK IMPORT ITEMS (one row per PDF page)
-- =========================================================
CREATE TABLE public.dp_bulk_import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.dp_bulk_import_batches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_index INT NOT NULL,
  page_file_path TEXT NOT NULL,
  ocr_text TEXT,
  matched_cpf TEXT,
  matched_nome TEXT,
  matched_colaborador_id UUID REFERENCES public.dp_colaboradores(id) ON DELETE SET NULL,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','imported','failed')),
  manual_override BOOLEAN NOT NULL DEFAULT false,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  imported_documento_id UUID REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(batch_id, page_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_bulk_import_items TO authenticated;
GRANT ALL ON public.dp_bulk_import_items TO service_role;
ALTER TABLE public.dp_bulk_import_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dp_bulk_item_admin_all" ON public.dp_bulk_import_items
  FOR ALL TO authenticated
  USING (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = dp_bulk_import_items.company_id AND c.user_id = auth.uid())
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    private.is_company_admin_or_owner(auth.uid(), company_id)
    OR EXISTS (SELECT 1 FROM companies c WHERE c.id = dp_bulk_import_items.company_id AND c.user_id = auth.uid())
    OR is_super_admin(auth.uid())
  );

CREATE INDEX dp_bulk_item_batch_idx ON public.dp_bulk_import_items(batch_id, page_index);
CREATE INDEX dp_bulk_item_status_idx ON public.dp_bulk_import_items(batch_id, status);

CREATE TRIGGER trg_dp_bulk_items_updated_at
  BEFORE UPDATE ON public.dp_bulk_import_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- STORAGE POLICIES for dp-bulk-import (bucket created via tool)
-- Path convention: {company_id}/{batch_id}/source.pdf OR {company_id}/{batch_id}/page_{n}.pdf
-- =========================================================
CREATE POLICY "dp_bulk_storage_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(name))[1]::uuid)
      OR EXISTS (SELECT 1 FROM companies c WHERE c.id = (storage.foldername(name))[1]::uuid AND c.user_id = auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(name))[1]::uuid)
      OR EXISTS (SELECT 1 FROM companies c WHERE c.id = (storage.foldername(name))[1]::uuid AND c.user_id = auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(name))[1]::uuid)
      OR EXISTS (SELECT 1 FROM companies c WHERE c.id = (storage.foldername(name))[1]::uuid AND c.user_id = auth.uid())
      OR is_super_admin(auth.uid())
    )
  );

CREATE POLICY "dp_bulk_storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), (storage.foldername(name))[1]::uuid)
      OR EXISTS (SELECT 1 FROM companies c WHERE c.id = (storage.foldername(name))[1]::uuid AND c.user_id = auth.uid())
      OR is_super_admin(auth.uid())
    )
  );
