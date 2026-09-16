-- 1) Convidado não lê mais a tabela de convites diretamente (nem o token)
DROP POLICY IF EXISTS "Invited user can view own invites" ON public.company_invites;

-- 2) RPC de convites pendentes deixa de devolver o token
DROP FUNCTION IF EXISTS public.my_pending_invites();

CREATE FUNCTION public.my_pending_invites()
RETURNS TABLE(id uuid, company_id uuid, company_name text, role text, expires_at timestamptz, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT i.id,
         i.company_id,
         coalesce(c.trade_name, c.name) AS company_name,
         i.role::text,
         i.expires_at,
         i.created_at
  FROM public.company_invites i
  JOIN public.companies c ON c.id = i.company_id
  WHERE auth.uid() IS NOT NULL
    AND i.status = 'pending'
    AND i.expires_at > now()
    AND lower(i.invited_email) = lower(coalesce(auth.jwt() ->> 'email', '###'))
  ORDER BY i.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.my_pending_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_pending_invites() TO authenticated;

-- 3) Políticas de documentos restritas a usuários autenticados
DROP POLICY IF EXISTS "dp_doc_bucket_legacy_read" ON storage.objects;
CREATE POLICY "dp_doc_bucket_legacy_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND name LIKE 'documentos/%'
  AND EXISTS (
    SELECT 1 FROM public.dp_documentos d
    WHERE d.file_path = storage.objects.name
      AND (
        private.is_company_admin_or_owner(auth.uid(), d.company_id)
        OR public.is_super_admin(auth.uid())
        OR (d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid()) AND d.tipo <> 'disciplinar'::public.dp_documento_tipo)
      )
  )
);

DROP POLICY IF EXISTS "dp_doc_bucket_read_autorizado" ON storage.objects;
CREATE POLICY "dp_doc_bucket_read_autorizado"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.dp_documentos d
      WHERE (d.file_path = storage.objects.name OR d.comprovante_file_path = storage.objects.name)
        AND d.company_id = (split_part(storage.objects.name, '/', 1))::uuid
        AND d.colaborador_id IS NOT NULL
        AND d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
        AND d.tipo <> 'disciplinar'::public.dp_documento_tipo
        AND d.ciclo_status = ANY (ARRAY['ativo','arquivado'])
    )
  )
);

-- Rollback:
-- CREATE POLICY "Invited user can view own invites" ON public.company_invites FOR SELECT TO authenticated
--   USING (lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', '')));
-- e recriar my_pending_invites com a coluna token e as políticas de storage com TO public.
