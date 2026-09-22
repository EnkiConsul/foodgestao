CREATE OR REPLACE FUNCTION public.dp_comprovante_anexar(
  p_documento_id uuid,
  p_arquivo jsonb,
  p_pago_em date DEFAULT NULL::date,
  p_confirmar_competencia boolean DEFAULT false
)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos;
  v_path text;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_path := nullif(p_arquivo->>'file_path','');
  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;
  PERFORM private.dp_documento_conferir(v_doc.company_id, v_doc.colaborador_id, NULL, v_path);

  IF p_pago_em IS NOT NULL THEN
    IF p_pago_em > current_date THEN RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_FUTURA'; END IF;
    IF v_doc.referencia_data IS NOT NULL
       AND p_pago_em < date_trunc('month', v_doc.referencia_data)::date THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_ANTES_DA_COMPETENCIA';
    END IF;
    -- Pagamento em mês diferente da competência do documento: só grava com
    -- confirmação explícita de quem está anexando.
    IF v_doc.referencia_data IS NOT NULL
       AND date_trunc('month', p_pago_em) <> date_trunc('month', v_doc.referencia_data)
       AND coalesce(p_confirmar_competencia, false) = false THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_COMPETENCIA_DIVERGENTE';
    END IF;
  END IF;

  UPDATE public.dp_documentos
     SET comprovante_file_path = v_path,
         comprovante_file_name = nullif(p_arquivo->>'file_name',''),
         comprovante_file_size = nullif(p_arquivo->>'file_size','')::bigint,
         comprovante_mime_type = nullif(p_arquivo->>'mime_type',''),
         comprovante_pago_em = p_pago_em,
         comprovante_uploaded_by = auth.uid(),
         comprovante_uploaded_at = now(),
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(
    v_doc, 'comprovante_anexado', NULL, v_doc.comprovante_file_path, v_path
  );

  RETURN CASE WHEN v_doc.comprovante_file_path IS DISTINCT FROM v_path
              THEN v_doc.comprovante_file_path ELSE NULL END;
END $function$;

REVOKE ALL ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean) TO service_role;
DROP FUNCTION IF EXISTS public.dp_comprovante_anexar(uuid, jsonb, date);