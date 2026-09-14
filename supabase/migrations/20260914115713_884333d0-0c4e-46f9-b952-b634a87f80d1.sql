-- =====================================================================
-- Fase 2 — versionamento, arquivamento e acesso autorizado a documentos
-- =====================================================================

-- 1) Colunas de versão e ciclo de vida ---------------------------------
ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ciclo_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS replaces_documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replaced_by_documento_id uuid REFERENCES public.dp_documentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by uuid,
  ADD COLUMN IF NOT EXISTS arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS arquivado_por uuid,
  ADD COLUMN IF NOT EXISTS arquivamento_motivo text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dp_documentos_ciclo_status_check'
  ) THEN
    ALTER TABLE public.dp_documentos
      ADD CONSTRAINT dp_documentos_ciclo_status_check
      CHECK (ciclo_status IN ('processando','ativo','substituido','arquivado','falhou'));
  END IF;
END $$;

-- Backfill explícito (linhas antigas): versão 1, ativas.
UPDATE public.dp_documentos
   SET versao = COALESCE(versao, 1),
       ciclo_status = COALESCE(ciclo_status, 'ativo')
 WHERE versao IS NULL OR ciclo_status IS NULL;

-- 2) Uma única versão ativa por identidade lógica ----------------------
-- Somente tipos que legitimamente possuem um documento vigente por
-- competência. Atestado, identidade, dependente e afins ficam fora.
CREATE UNIQUE INDEX IF NOT EXISTS dp_documentos_versao_ativa_unica
  ON public.dp_documentos (company_id, colaborador_id, tipo, referencia_data)
  WHERE ciclo_status = 'ativo'
    AND colaborador_id IS NOT NULL
    AND referencia_data IS NOT NULL
    AND tipo IN (
      'contracheque','contracheque_13','contracheque_ferias','adiantamento',
      'plr','pro_labore','informe_rendimentos','recibo_ferias','aviso_ferias',
      'trct','demonstrativo_rescisorio','ficha_registro','contrato'
    );

CREATE INDEX IF NOT EXISTS dp_documentos_ciclo_idx
  ON public.dp_documentos (company_id, ciclo_status);
CREATE INDEX IF NOT EXISTS dp_documentos_replaces_idx
  ON public.dp_documentos (replaces_documento_id) WHERE replaces_documento_id IS NOT NULL;

-- 3) Reserva idempotente do item de importação -------------------------
ALTER TABLE public.dp_bulk_import_items
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.dp_bulk_item_reservar(_item_id uuid)
RETURNS TABLE (id uuid, ja_importado boolean, imported_documento_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.dp_bulk_import_items;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  SELECT * INTO v_row
    FROM public.dp_bulk_import_items i
   WHERE i.id = _item_id
   FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  IF v_row.status = 'imported' THEN
    RETURN QUERY SELECT v_row.id, true, v_row.imported_documento_id;
    RETURN;
  END IF;

  IF v_row.claim_expires_at IS NOT NULL AND v_row.claim_expires_at > now() THEN
    RETURN;
  END IF;

  UPDATE public.dp_bulk_import_items
     SET claim_expires_at = now() + interval '5 minutes'
   WHERE public.dp_bulk_import_items.id = _item_id;

  RETURN QUERY SELECT v_row.id, false, NULL::uuid;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_item_reservar(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_bulk_item_reservar(uuid) TO service_role;

-- 4) Publicação atômica da nova versão ---------------------------------
CREATE OR REPLACE FUNCTION public.dp_documento_versao_publicar(
  _novo_id uuid,
  _anterior_id uuid DEFAULT NULL,
  _motivo text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo public.dp_documentos;
  v_ant public.dp_documentos;
  v_service boolean := (
    current_setting('request.jwt.claim.role', true) = 'service_role'
    OR auth.role() = 'service_role'
  );
BEGIN
  SELECT * INTO v_novo FROM public.dp_documentos WHERE id = _novo_id FOR UPDATE;
  IF v_novo.id IS NULL THEN RAISE EXCEPTION 'documento_inexistente'; END IF;

  IF NOT v_service
     AND NOT private.is_company_admin_or_owner(auth.uid(), v_novo.company_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  IF _anterior_id IS NOT NULL THEN
    SELECT * INTO v_ant FROM public.dp_documentos WHERE id = _anterior_id FOR UPDATE;
    IF v_ant.id IS NULL OR v_ant.company_id <> v_novo.company_id THEN
      RAISE EXCEPTION 'documento_anterior_invalido';
    END IF;

    UPDATE public.dp_documentos
       SET ciclo_status = 'substituido',
           replaced_by_documento_id = _novo_id,
           superseded_at = now(),
           superseded_by = CASE WHEN v_service THEN v_novo.uploaded_by ELSE auth.uid() END,
           updated_at = now()
     WHERE id = _anterior_id;

    UPDATE public.dp_documentos
       SET versao = COALESCE(v_ant.versao, 1) + 1,
           replaces_documento_id = _anterior_id
     WHERE id = _novo_id;

    INSERT INTO public.dp_documento_eventos (
      company_id, documento_id, origem, acao, titulo, tipo, competencia,
      colaborador_id, arquivo_anterior, arquivo_novo, motivo, autor_id
    ) VALUES (
      v_novo.company_id, _novo_id, 'sistema', 'document_replaced', v_novo.titulo,
      v_novo.tipo::text, to_char(v_novo.referencia_data, 'YYYY-MM'), v_novo.colaborador_id,
      _anterior_id::text, _novo_id::text, _motivo,
      CASE WHEN v_service THEN v_novo.uploaded_by ELSE auth.uid() END
    );
  END IF;

  UPDATE public.dp_documentos
     SET ciclo_status = 'ativo', updated_at = now()
   WHERE id = _novo_id;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_versao_publicar(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_versao_publicar(uuid, uuid, text) TO authenticated, service_role;

-- 5) Arquivar (padrão) e excluir definitivamente (exceção) -------------
CREATE OR REPLACE FUNCTION public.dp_documento_arquivar(_documento_id uuid, _motivo text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.dp_documentos;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'documento_inexistente'; END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_doc.company_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  UPDATE public.dp_documentos
     SET ciclo_status = 'arquivado',
         arquivado_em = now(),
         arquivado_por = auth.uid(),
         arquivamento_motivo = _motivo,
         updated_at = now()
   WHERE id = _documento_id;

  INSERT INTO public.dp_documento_eventos (
    company_id, documento_id, origem, acao, titulo, tipo, competencia,
    colaborador_id, motivo, autor_id
  ) VALUES (
    v_doc.company_id, _documento_id, 'dp', 'document_archived', v_doc.titulo,
    v_doc.tipo::text, to_char(v_doc.referencia_data, 'YYYY-MM'), v_doc.colaborador_id,
    _motivo, auth.uid()
  );

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_arquivar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_arquivar(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_documento_excluir_definitivo(_documento_id uuid, _motivo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.dp_documentos;
BEGIN
  IF _motivo IS NULL OR length(btrim(_motivo)) < 3 THEN
    RAISE EXCEPTION 'motivo_obrigatorio';
  END IF;

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'documento_inexistente'; END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_doc.company_id)
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'nao_autorizado';
  END IF;

  INSERT INTO public.dp_documento_eventos (
    company_id, documento_id, origem, acao, titulo, tipo, competencia,
    colaborador_id, arquivo_anterior, motivo, autor_id
  ) VALUES (
    v_doc.company_id, _documento_id, 'dp', 'document_deleted', v_doc.titulo,
    v_doc.tipo::text, to_char(v_doc.referencia_data, 'YYYY-MM'), v_doc.colaborador_id,
    _documento_id::text, _motivo, auth.uid()
  );

  DELETE FROM public.dp_documentos WHERE id = _documento_id;
  RETURN v_doc.file_path;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_excluir_definitivo(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_excluir_definitivo(uuid, text) TO authenticated, service_role;

-- 6) Caminho do arquivo somente após autorização -----------------------
CREATE OR REPLACE FUNCTION public.dp_documento_arquivo(_documento_id uuid)
RETURNS TABLE (file_path text, file_name text, mime_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.dp_documentos;
  v_colab uuid;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id;
  IF v_doc.id IS NULL THEN
    RETURN; -- não revela se o documento existe em outra empresa
  END IF;

  IF private.is_company_admin_or_owner(auth.uid(), v_doc.company_id)
     OR public.is_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT v_doc.file_path, v_doc.file_name, v_doc.mime_type;
    RETURN;
  END IF;

  v_colab := public.dp_colaborador_of(auth.uid());
  IF v_colab IS NOT NULL
     AND v_doc.colaborador_id = v_colab
     AND v_doc.tipo <> 'disciplinar'::dp_documento_tipo
     AND v_doc.ciclo_status IN ('ativo','arquivado') THEN
    RETURN QUERY SELECT v_doc.file_path, v_doc.file_name, v_doc.mime_type;
  END IF;

  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_arquivo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_arquivo(uuid) TO authenticated, service_role;

-- 7) Storage: leitura exige documento correspondente -------------------
DROP POLICY IF EXISTS dp_doc_bucket_colab_read ON storage.objects;
DROP POLICY IF EXISTS dp_doc_bucket_admin_or_owner_read ON storage.objects;

CREATE POLICY dp_doc_bucket_read_autorizado
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dp-documentos'
  AND (
    private.is_company_admin_or_owner(auth.uid(), (split_part(name, '/', 1))::uuid)
    OR public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
        FROM public.dp_documentos d
       WHERE d.file_path = storage.objects.name
         AND d.company_id = (split_part(storage.objects.name, '/', 1))::uuid
         AND d.colaborador_id IS NOT NULL
         AND d.colaborador_id = public.dp_colaborador_ativo_of(auth.uid())
         AND d.tipo <> 'disciplinar'::dp_documento_tipo
         AND d.ciclo_status IN ('ativo','arquivado')
    )
  )
);