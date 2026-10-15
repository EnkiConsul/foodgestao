ALTER TABLE public.dp_documento_comprovantes
  ADD COLUMN IF NOT EXISTS natureza text NOT NULL DEFAULT 'pagamento'
  CHECK (natureza IN ('pagamento','estorno','repagamento'));
ALTER TABLE public.dp_documentos ADD COLUMN IF NOT EXISTS recibo_diferenca_documento_id uuid;

CREATE OR REPLACE FUNCTION private.dp_doc_comprovantes_consolidar()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_doc uuid := coalesce(NEW.documento_id, OLD.documento_id);
BEGIN
  UPDATE public.dp_documentos d SET
    comprovantes_extra_qtd = s.qtd,
    comprovantes_extra_cents = s.total
  FROM (
    SELECT count(*)::int qtd,
           coalesce(sum((CASE WHEN natureza = 'estorno' THEN -1 ELSE 1 END)
             * (coalesce(valor_bancario_cents,0)+coalesce(valor_especie_cents,0))),0)::bigint total
    FROM public.dp_documento_comprovantes WHERE documento_id = v_doc
  ) s
  WHERE d.id = v_doc;
  RETURN NULL;
END $function$;

DROP FUNCTION IF EXISTS public.dp_comprovante_adicionar(uuid, jsonb, date, text, bigint, bigint, jsonb);
CREATE OR REPLACE FUNCTION public.dp_comprovante_adicionar(p_documento_id uuid, p_arquivo jsonb, p_pago_em date, p_modalidade text, p_valor_bancario_cents bigint DEFAULT NULL::bigint, p_valor_especie_cents bigint DEFAULT NULL::bigint, p_leitura jsonb DEFAULT NULL::jsonb, p_natureza text DEFAULT 'pagamento')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_doc public.dp_documentos; v_path text; v_id uuid;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_doc.comprovante_file_path IS NULL THEN RAISE EXCEPTION 'DOC_COMPROVANTE_INEXISTENTE'; END IF;
  IF coalesce(p_natureza,'') NOT IN ('pagamento','estorno','repagamento') THEN RAISE EXCEPTION 'DOC_COMPROVANTE_NATUREZA_INVALIDA'; END IF;
  v_path := nullif(p_arquivo->>'file_path','');
  IF v_path IS NULL THEN RAISE EXCEPTION 'DOC_ARQUIVO_OBRIGATORIO'; END IF;
  PERFORM private.dp_documento_conferir(v_doc.company_id, v_doc.colaborador_id, NULL, v_path);
  IF p_pago_em IS NULL OR p_pago_em > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_INVALIDA';
  END IF;
  IF p_modalidade NOT IN ('bancario','especie','misto') THEN RAISE EXCEPTION 'DOC_COMPROVANTE_MODALIDADE_INVALIDA'; END IF;
  IF p_modalidade = 'bancario' THEN p_valor_especie_cents := NULL;
  ELSIF p_modalidade = 'especie' THEN p_valor_bancario_cents := NULL; END IF;
  IF coalesce(p_valor_bancario_cents,0) < 0 OR coalesce(p_valor_especie_cents,0) < 0
     OR coalesce(p_valor_bancario_cents,0)+coalesce(p_valor_especie_cents,0) <= 0
     OR coalesce(p_valor_bancario_cents,0)+coalesce(p_valor_especie_cents,0) > 100000000 THEN
    RAISE EXCEPTION 'DOC_COMPROVANTE_VALOR_INVALIDO';
  END IF;
  INSERT INTO public.dp_documento_comprovantes(company_id, documento_id, file_path, file_name, file_size, mime_type,
    pago_em, modalidade, valor_bancario_cents, valor_especie_cents, leitura, created_by, natureza)
  VALUES (v_doc.company_id, v_doc.id, v_path, p_arquivo->>'file_name', nullif(p_arquivo->>'file_size','')::bigint,
    p_arquivo->>'mime_type', p_pago_em, p_modalidade, p_valor_bancario_cents, p_valor_especie_cents, p_leitura, auth.uid(), p_natureza)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.dp_comprovante_adicionar(uuid, jsonb, date, text, bigint, bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_adicionar(uuid, jsonb, date, text, bigint, bigint, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_documento_recibo_diferenca_vincular(p_documento_id uuid, p_recibo_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_doc public.dp_documentos; v_recibo public.dp_documentos;
BEGIN
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_recibo FROM public.dp_documentos WHERE id = p_recibo_id;
  IF v_recibo.id IS NULL OR v_recibo.company_id <> v_doc.company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_recibos r WHERE r.documento_id = p_recibo_id
                  AND r.company_id = v_doc.company_id AND r.cancelado_em IS NULL) THEN
    RAISE EXCEPTION 'DOC_RECIBO_TIPO_INVALIDO';
  END IF;
  IF v_recibo.colaborador_id IS DISTINCT FROM v_doc.colaborador_id THEN RAISE EXCEPTION 'DOC_RECIBO_COLABORADOR_DIVERGENTE'; END IF;
  UPDATE public.dp_documentos SET recibo_diferenca_documento_id = p_recibo_id, updated_at = now() WHERE id = v_doc.id;
  PERFORM private.dp_doc_evento(v_doc, 'recibo_diferenca_vinculado', NULL, NULL, v_recibo.file_path);
END $function$;
REVOKE ALL ON FUNCTION public.dp_documento_recibo_diferenca_vincular(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_recibo_diferenca_vincular(uuid, uuid) TO authenticated, service_role;