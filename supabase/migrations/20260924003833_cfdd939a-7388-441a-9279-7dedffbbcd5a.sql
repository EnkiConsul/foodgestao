-- 1) Conversão segura de texto para identificador
CREATE OR REPLACE FUNCTION public.try_cast_uuid(p_val text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_val ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN p_val::uuid
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.try_cast_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.try_cast_uuid(text) TO anon, authenticated, service_role;

-- 2) dp-documentos
DROP POLICY IF EXISTS "dp_doc_bucket_admin_write" ON storage.objects;
CREATE POLICY "dp_doc_bucket_admin_write" ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'dp-documentos'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'dp-documentos'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "dp_doc_bucket_read_autorizado" ON storage.objects;
CREATE POLICY "dp_doc_bucket_read_autorizado" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-documentos'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR public.is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.dp_documentos d
        WHERE (d.file_path = objects.name OR d.comprovante_file_path = objects.name)
          AND d.company_id = public.try_cast_uuid(split_part(objects.name, '/', 1))
          AND d.colaborador_id IS NOT NULL
          AND d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
          AND d.tipo <> 'disciplinar'::dp_documento_tipo
          AND d.ciclo_status = ANY (ARRAY['ativo'::text, 'arquivado'::text])
      )
    )
  );

-- 3) dp-disciplinar
DROP POLICY IF EXISTS "dp_disciplinar_read" ON storage.objects;
CREATE POLICY "dp_disciplinar_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
  );

DROP POLICY IF EXISTS "dp_disciplinar_write" ON storage.objects;
CREATE POLICY "dp_disciplinar_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
  );

DROP POLICY IF EXISTS "dp_disciplinar_update" ON storage.objects;
CREATE POLICY "dp_disciplinar_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
  );

DROP POLICY IF EXISTS "dp_disciplinar_delete" ON storage.objects;
CREATE POLICY "dp_disciplinar_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dp-disciplinar'
    AND private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
  );

-- 4) dp-bulk-import
DROP POLICY IF EXISTS "dp_bulk_storage_admin_read" ON storage.objects;
CREATE POLICY "dp_bulk_storage_admin_read" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = public.try_cast_uuid(split_part(objects.name, '/', 1))
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "dp_bulk_storage_admin_write" ON storage.objects;
CREATE POLICY "dp_bulk_storage_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = public.try_cast_uuid(split_part(objects.name, '/', 1))
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "dp_bulk_storage_admin_update" ON storage.objects;
CREATE POLICY "dp_bulk_storage_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = public.try_cast_uuid(split_part(objects.name, '/', 1))
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS "dp_bulk_storage_admin_delete" ON storage.objects;
CREATE POLICY "dp_bulk_storage_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'dp-bulk-import'
    AND (
      private.is_company_admin_or_owner(auth.uid(), public.try_cast_uuid(split_part(name, '/', 1)))
      OR EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = public.try_cast_uuid(split_part(objects.name, '/', 1))
          AND c.user_id = auth.uid()
      )
      OR public.is_super_admin(auth.uid())
    )
  );
