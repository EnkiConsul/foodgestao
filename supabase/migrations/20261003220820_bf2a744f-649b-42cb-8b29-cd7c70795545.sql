ALTER TABLE public.dp_documentos ADD COLUMN IF NOT EXISTS assinatura_fisica boolean NOT NULL DEFAULT false;
ALTER TABLE public.dp_bulk_import_batches ADD COLUMN IF NOT EXISTS ja_assinado boolean NOT NULL DEFAULT false;

UPDATE public.dp_documentos SET assinatura_fisica = true
WHERE NOT exige_aceite AND assinatura_fisica = false
  AND tipo::text IN ('aviso_previo','desligamento','trct','demonstrativo_rescisorio','outros_desligamento','acerto_rescisorio','disciplinar','recibo_pagamento_especie');

CREATE OR REPLACE FUNCTION public.dp_documento_anexar_via_assinada(
  _documento_id uuid, _file_path text, _file_name text, _mime_type text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  anterior text;
BEGIN
  SELECT id, company_id, colaborador_id, exige_aceite, assinatura_fisica, via_assinada_path INTO d
  FROM public.dp_documentos WHERE id = _documento_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado'; END IF;
  IF NOT public.tem_permissao(d.company_id, 'dp.documentos', 'inclusao') THEN
    RAISE EXCEPTION 'Sem permissão para anexar a via assinada';
  END IF;
  IF d.exige_aceite OR NOT d.assinatura_fisica THEN
    RAISE EXCEPTION 'Este documento não usa assinatura física';
  END IF;
  IF _file_path IS NULL
     OR split_part(_file_path, '/', 1) <> d.company_id::text
     OR split_part(_file_path, '/', 2) <> COALESCE(d.colaborador_id::text, 'geral')
     OR split_part(_file_path, '/', 3) <> 'vias-assinadas' THEN
    RAISE EXCEPTION 'Arquivo fora da pasta do documento';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'dp-documentos' AND o.name = _file_path) THEN
    RAISE EXCEPTION 'Arquivo da via assinada não encontrado';
  END IF;
  anterior := d.via_assinada_path;
  UPDATE public.dp_documentos SET
    via_assinada_path = _file_path, via_assinada_nome = _file_name, via_assinada_mime = _mime_type,
    via_assinada_em = now(), via_assinada_por = auth.uid()
  WHERE id = _documento_id;
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, metadata)
  VALUES (auth.uid(), CASE WHEN anterior IS NULL THEN 'dp_via_assinada_anexada' ELSE 'dp_via_assinada_substituida' END,
          'dp_documentos', _documento_id::text,
          jsonb_build_object('company_id', d.company_id, 'anterior', anterior, 'novo', _file_path));
  RETURN anterior;
END $$;
REVOKE ALL ON FUNCTION public.dp_documento_anexar_via_assinada(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_anexar_via_assinada(uuid, text, text, text) TO authenticated, service_role;

-- Envio da via assinada por quem tem permissão de inclusão na Matriz (só na pasta de vias).
DROP POLICY IF EXISTS dp_doc_bucket_via_assinada_insert ON storage.objects;
CREATE POLICY dp_doc_bucket_via_assinada_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dp-documentos' AND split_part(name, '/', 3) = 'vias-assinadas'
  AND public.tem_permissao(try_cast_uuid(split_part(name, '/', 1)), 'dp.documentos', 'inclusao'));

-- O arquivo oficial passa a ser a via assinada quando existir; 'original' devolve a minuta.
CREATE OR REPLACE FUNCTION public.dp_documento_arquivo(_documento_id uuid, _variante text DEFAULT 'documento'::text)
 RETURNS TABLE(file_path text, file_name text, mime_type text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos; v_colab uuid; v_path text; v_name text; v_mime text;
BEGIN
  IF _variante NOT IN ('documento','comprovante','original') THEN RETURN; END IF;
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id;
  IF v_doc.id IS NULL THEN RETURN; END IF;
  IF _variante = 'comprovante' THEN
    v_path := v_doc.comprovante_file_path; v_name := v_doc.comprovante_file_name; v_mime := v_doc.comprovante_mime_type;
  ELSIF _variante = 'documento' AND v_doc.via_assinada_path IS NOT NULL THEN
    v_path := v_doc.via_assinada_path; v_name := v_doc.via_assinada_nome; v_mime := v_doc.via_assinada_mime;
  ELSE
    v_path := v_doc.file_path; v_name := v_doc.file_name; v_mime := v_doc.mime_type;
  END IF;
  IF v_path IS NULL THEN RETURN; END IF;
  IF private.is_company_admin_or_owner(auth.uid(), v_doc.company_id) OR public.is_super_admin(auth.uid())
     OR public.tem_permissao(v_doc.company_id, 'dp.documentos', 'visualizacao') THEN
    RETURN QUERY SELECT v_path, v_name, v_mime; RETURN;
  END IF;
  v_colab := public.dp_colaborador_of(auth.uid());
  IF v_colab IS NOT NULL AND v_doc.colaborador_id = v_colab
     AND v_doc.tipo <> 'disciplinar'::dp_documento_tipo
     AND v_doc.ciclo_status IN ('ativo','arquivado')
     AND _variante <> 'original' THEN
    RETURN QUERY SELECT v_path, v_name, v_mime;
  END IF;
  RETURN;
END $function$;