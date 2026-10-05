CREATE OR REPLACE FUNCTION public.dp_comprovante_anexar(
  p_documento_id uuid,
  p_arquivo jsonb,
  p_pago_em date,
  p_confirmar_competencia boolean DEFAULT false,
  p_modalidade text DEFAULT 'bancario',
  p_valor_bancario_cents bigint DEFAULT NULL,
  p_valor_especie_cents bigint DEFAULT NULL,
  p_leitura jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos;
  v_path text;
  v_modalidade text;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_path := nullif(p_arquivo->>'file_path','');
  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;
  PERFORM private.dp_documento_conferir(v_doc.company_id, v_doc.colaborador_id, NULL, v_path);

  IF p_pago_em IS NULL THEN RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_OBRIGATORIA'; END IF;
  IF p_pago_em > current_date THEN RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_FUTURA'; END IF;
  IF v_doc.referencia_data IS NOT NULL
     AND p_pago_em < date_trunc('month', v_doc.referencia_data)::date THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_ANTES_DA_COMPETENCIA';
  END IF;
  -- Pagamento em mês diferente da competência do documento: só grava com
  -- confirmação explícita de quem está anexando.
  -- Exceção legal (Art. 459, §1º CLT): documentos de folha mensal podem ser
  -- pagos até o 5º dia útil do mês seguinte à competência, então pagamento
  -- no mês imediatamente seguinte NÃO é divergência.
  IF v_doc.referencia_data IS NOT NULL
     AND date_trunc('month', p_pago_em) <> date_trunc('month', v_doc.referencia_data)
     AND NOT (
       v_doc.tipo::text IN ('contracheque','contracheque_13','pro_labore','plr','outros_pagamentos','gorjeta')
       AND date_trunc('month', p_pago_em) = (date_trunc('month', v_doc.referencia_data) + interval '1 month')
     )
     AND coalesce(p_confirmar_competencia, false) = false THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_COMPETENCIA_DIVERGENTE';
  END IF;

  v_modalidade := coalesce(nullif(trim(p_modalidade), ''), 'bancario');
  IF v_modalidade NOT IN ('bancario','especie','misto') THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_MODALIDADE_INVALIDA';
  END IF;
  IF coalesce(p_valor_bancario_cents, 0) < 0 OR coalesce(p_valor_especie_cents, 0) < 0 THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_VALOR_INVALIDO';
  END IF;
  IF v_modalidade = 'especie' AND coalesce(p_valor_especie_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_VALOR_ESPECIE_OBRIGATORIO';
  END IF;
  IF v_modalidade = 'misto'
     AND (coalesce(p_valor_bancario_cents, 0) <= 0 OR coalesce(p_valor_especie_cents, 0) <= 0) THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_MISTO_VALORES';
  END IF;

  UPDATE public.dp_documentos
     SET comprovante_file_path = v_path,
         comprovante_file_name = nullif(p_arquivo->>'file_name',''),
         comprovante_file_size = nullif(p_arquivo->>'file_size','')::bigint,
         comprovante_mime_type = nullif(p_arquivo->>'mime_type',''),
         comprovante_pago_em = p_pago_em,
         comprovante_modalidade = v_modalidade,
         comprovante_valor_bancario_cents =
           CASE WHEN v_modalidade = 'especie' THEN NULL ELSE p_valor_bancario_cents END,
         comprovante_valor_especie_cents =
           CASE WHEN v_modalidade = 'bancario' THEN NULL ELSE p_valor_especie_cents END,
         comprovante_leitura = p_leitura,
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

REVOKE ALL ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean, text, bigint, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_anexar(uuid, jsonb, date, boolean, text, bigint, bigint, jsonb) TO authenticated, service_role;