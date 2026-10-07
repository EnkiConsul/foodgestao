CREATE OR REPLACE FUNCTION public.dp_comprovante_recibo_vincular(p_documento_id uuid, p_recibo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos;
  v_recibo public.dp_documentos;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_recibo FROM public.dp_documentos WHERE id = p_recibo_id;
  IF v_recibo.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_recibo.company_id <> v_doc.company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_recibo.tipo <> 'recibo_pagamento_especie'::public.dp_documento_tipo
     AND NOT EXISTS (SELECT 1 FROM public.dp_recibos r
                      WHERE r.documento_id = p_recibo_id AND r.company_id = v_doc.company_id
                        AND r.cancelado_em IS NULL) THEN
    RAISE EXCEPTION 'DOC_RECIBO_TIPO_INVALIDO';
  END IF;
  IF v_recibo.colaborador_id IS DISTINCT FROM v_doc.colaborador_id THEN
    RAISE EXCEPTION 'DOC_RECIBO_COLABORADOR_DIVERGENTE';
  END IF;
  IF v_doc.comprovante_recibo_documento_id IS NOT DISTINCT FROM p_recibo_id THEN RETURN; END IF;
  UPDATE public.dp_documentos SET comprovante_recibo_documento_id = p_recibo_id, updated_at = now() WHERE id = v_doc.id;
  PERFORM private.dp_doc_evento(v_doc, 'comprovante_recibo_vinculado', NULL, NULL, v_recibo.file_path);
END $function$;
REVOKE ALL ON FUNCTION public.dp_comprovante_recibo_vincular(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_recibo_vincular(uuid, uuid) TO authenticated, service_role;