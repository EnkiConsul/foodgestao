ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS origem_recibo_id uuid REFERENCES public.dp_recibos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dp_documentos_origem_recibo_unico
  ON public.dp_documentos (origem_recibo_id)
  WHERE origem_recibo_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.dp_documento_comprovante_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  IF NEW.comprovante_file_path IS NULL AND NEW.origem_recibo_id IS NULL THEN
    NEW.comprovante_file_name := NULL;
    NEW.comprovante_file_size := NULL;
    NEW.comprovante_mime_type := NULL;
    NEW.comprovante_pago_em := NULL;
    NEW.comprovante_uploaded_by := NULL;
    NEW.comprovante_uploaded_at := NULL;
    NEW.comprovante_modalidade := NULL;
    NEW.comprovante_valor_bancario_cents := NULL;
    NEW.comprovante_valor_especie_cents := NULL;
    NEW.comprovante_leitura := NULL;
    RETURN NEW;
  END IF;

  IF NEW.comprovante_file_path IS NULL AND NEW.origem_recibo_id IS NOT NULL THEN
    IF NEW.comprovante_pago_em IS NULL THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_OBRIGATORIA';
    END IF;
    IF NEW.comprovante_modalidade IS NULL THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_MODALIDADE_OBRIGATORIA';
    END IF;
    IF NEW.comprovante_modalidade = 'bancario' THEN
      NEW.comprovante_valor_especie_cents := NULL;
    ELSIF NEW.comprovante_modalidade = 'especie' THEN
      NEW.comprovante_valor_bancario_cents := NULL;
    ELSIF NEW.comprovante_modalidade = 'misto' AND (
      coalesce(NEW.comprovante_valor_bancario_cents, 0) <= 0
      OR coalesce(NEW.comprovante_valor_especie_cents, 0) <= 0
    ) THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_MISTO_VALORES';
    END IF;
    NEW.comprovante_uploaded_at := COALESCE(NEW.comprovante_uploaded_at, now());
    RETURN NEW;
  END IF;

  IF NOT public.dp_documento_aceita_comprovante(NEW.tipo) THEN
    RAISE EXCEPTION 'Este tipo de documento não aceita comprovante de pagamento';
  END IF;

  IF NEW.submetido_por_colaborador THEN
    RAISE EXCEPTION 'Comprovante de pagamento só pode ser anexado pela empresa';
  END IF;

  IF NEW.comprovante_modalidade = 'bancario' THEN
    NEW.comprovante_valor_especie_cents := NULL;
  ELSIF NEW.comprovante_modalidade = 'especie' THEN
    NEW.comprovante_valor_bancario_cents := NULL;
  ELSIF NEW.comprovante_modalidade = 'misto' THEN
    IF coalesce(NEW.comprovante_valor_bancario_cents, 0) <= 0
       OR coalesce(NEW.comprovante_valor_especie_cents, 0) <= 0 THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_MISTO_VALORES';
    END IF;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.comprovante_file_path IS DISTINCT FROM NEW.comprovante_file_path THEN
    IF NEW.comprovante_pago_em IS NULL THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_DATA_OBRIGATORIA';
    END IF;
    IF NEW.comprovante_modalidade IS NULL THEN
      RAISE EXCEPTION 'DOC_COMPROVANTE_MODALIDADE_OBRIGATORIA';
    END IF;
    NEW.comprovante_uploaded_at := now();
    NEW.comprovante_uploaded_by := COALESCE(NEW.comprovante_uploaded_by, auth.uid());
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.dp_documento_comprovante_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.dp_recibo_sincronizar_aceite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  UPDATE public.dp_recibos
     SET assinado_em = COALESCE(assinado_em, NEW.aceito_em),
         assinado_ip = COALESCE(assinado_ip, NEW.ip),
         assinado_user_agent = COALESCE(assinado_user_agent, NEW.user_agent),
         assinado_hash = COALESCE(assinado_hash, NEW.conteudo_hash),
         assinado_confirmacao = COALESCE(
           assinado_confirmacao,
           jsonb_build_object('metodo', 'portal', 'canal', 'portal', 'aceite_id', NEW.id)
         ),
         link_token_hash = NULL,
         updated_at = now()
   WHERE documento_id = NEW.documento_id
     AND colaborador_id = NEW.colaborador_id
     AND cancelado_em IS NULL;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.dp_recibo_sincronizar_aceite() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_recibo_sincronizar_aceite ON public.dp_documento_aceites;
CREATE TRIGGER trg_dp_recibo_sincronizar_aceite
AFTER INSERT ON public.dp_documento_aceites
FOR EACH ROW EXECUTE FUNCTION private.dp_recibo_sincronizar_aceite();

CREATE OR REPLACE FUNCTION public.dp_recibo_vincular_documento(
  p_recibo_id uuid,
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_recibo public.dp_recibos;
  v_doc public.dp_documentos;
  v_aceite public.dp_documento_aceites;
BEGIN
  IF NOT private.dp_doc_service_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_recibo:' || p_recibo_id::text, 0));

  SELECT * INTO v_recibo FROM public.dp_recibos WHERE id = p_recibo_id FOR UPDATE;
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_recibo.id IS NULL OR v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_recibo.cancelado_em IS NOT NULL OR v_doc.arquivado_em IS NOT NULL THEN RAISE EXCEPTION 'RECIBO_INDISPONIVEL'; END IF;
  IF v_recibo.colaborador_id IS NULL
     OR v_doc.colaborador_id IS DISTINCT FROM v_recibo.colaborador_id
     OR v_doc.company_id IS DISTINCT FROM v_recibo.company_id
     OR v_doc.file_path IS DISTINCT FROM v_recibo.file_path THEN
    RAISE EXCEPTION 'RECIBO_DOCUMENTO_DIVERGENTE';
  END IF;
  IF v_recibo.canal_assinatura = 'whatsapp' THEN RAISE EXCEPTION 'RECIBO_CANAL_INVALIDO'; END IF;

  UPDATE public.dp_documentos
     SET origem_recibo_id = v_recibo.id,
         comprovante_pago_em = v_recibo.pago_em,
         comprovante_modalidade = v_recibo.modalidade,
         comprovante_valor_bancario_cents = v_recibo.valor_bancario_cents,
         comprovante_valor_especie_cents = v_recibo.valor_especie_cents,
         comprovante_uploaded_by = v_recibo.created_by,
         comprovante_uploaded_at = COALESCE(comprovante_uploaded_at, now()),
         updated_at = now()
   WHERE id = v_doc.id;

  UPDATE public.dp_recibos
     SET documento_id = v_doc.id, updated_at = now()
   WHERE id = v_recibo.id;

  SELECT * INTO v_aceite
    FROM public.dp_documento_aceites
   WHERE documento_id = v_doc.id
   ORDER BY aceito_em DESC
   LIMIT 1;
  IF v_aceite.id IS NOT NULL THEN
    UPDATE public.dp_recibos
       SET assinado_em = COALESCE(assinado_em, v_aceite.aceito_em),
           assinado_ip = COALESCE(assinado_ip, v_aceite.ip),
           assinado_user_agent = COALESCE(assinado_user_agent, v_aceite.user_agent),
           assinado_hash = COALESCE(assinado_hash, v_aceite.conteudo_hash),
           assinado_confirmacao = COALESCE(
             assinado_confirmacao,
             jsonb_build_object('metodo', 'portal', 'canal', 'portal', 'aceite_id', v_aceite.id)
           ),
           updated_at = now()
     WHERE id = v_recibo.id;
  END IF;

  PERFORM private.dp_doc_evento(v_doc, 'recibo_vinculado', NULL, NULL, v_doc.file_path);
END $$;

REVOKE ALL ON FUNCTION public.dp_recibo_vincular_documento(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_recibo_vincular_documento(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_recibo_assinar_externo(
  p_recibo_id uuid,
  p_hash text,
  p_ip text,
  p_user_agent text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_recibo public.dp_recibos;
  v_agora timestamptz := now();
BEGIN
  IF NOT private.dp_doc_service_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_recibo:' || p_recibo_id::text, 0));
  SELECT * INTO v_recibo FROM public.dp_recibos WHERE id = p_recibo_id FOR UPDATE;
  IF v_recibo.id IS NULL OR v_recibo.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'RECIBO_INDISPONIVEL'; END IF;
  IF v_recibo.colaborador_id IS NOT NULL OR v_recibo.canal_assinatura <> 'whatsapp' THEN
    RAISE EXCEPTION 'RECIBO_CANAL_INVALIDO';
  END IF;
  IF v_recibo.assinado_em IS NOT NULL THEN RETURN v_recibo.assinado_em; END IF;
  IF p_hash IS NULL OR length(p_hash) <> 64 THEN RAISE EXCEPTION 'RECIBO_HASH_INVALIDO'; END IF;

  UPDATE public.dp_recibos
     SET assinado_em = v_agora,
         assinado_ip = nullif(trim(coalesce(p_ip, '')), ''),
         assinado_user_agent = nullif(left(coalesce(p_user_agent, ''), 400), ''),
         assinado_hash = p_hash,
         assinado_confirmacao = jsonb_build_object(
           'metodo', 'cpf', 'canal', 'whatsapp', 'declaracao', 'Li e concordo com o recibo'
         ),
         link_token_hash = NULL,
         updated_at = now()
   WHERE id = v_recibo.id;
  RETURN v_agora;
END $$;

REVOKE ALL ON FUNCTION public.dp_recibo_assinar_externo(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_recibo_assinar_externo(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.dp_recibo_cancelar(
  p_recibo_id uuid,
  p_cancelado_por uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_recibo public.dp_recibos;
  v_doc public.dp_documentos;
BEGIN
  IF NOT private.dp_doc_service_role() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_recibo:' || p_recibo_id::text, 0));
  SELECT * INTO v_recibo FROM public.dp_recibos WHERE id = p_recibo_id FOR UPDATE;
  IF v_recibo.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_recibo.cancelado_em IS NOT NULL THEN RETURN; END IF;

  IF v_recibo.assinado_em IS NOT NULL OR EXISTS (
    SELECT 1 FROM public.dp_documento_aceites a WHERE a.documento_id = v_recibo.documento_id
  ) THEN RAISE EXCEPTION 'RECIBO_ASSINADO'; END IF;

  IF v_recibo.documento_id IS NOT NULL THEN
    SELECT * INTO v_doc FROM public.dp_documentos WHERE id = v_recibo.documento_id FOR UPDATE;
    IF v_doc.id IS NOT NULL AND v_doc.arquivado_em IS NULL THEN
      UPDATE public.dp_documentos
         SET ciclo_status = 'arquivado',
             arquivado_em = now(),
             arquivado_por = p_cancelado_por,
             arquivamento_motivo = 'Recibo cancelado',
             updated_at = now()
       WHERE id = v_doc.id;
      PERFORM private.dp_doc_evento(v_doc, 'document_deleted', 'Recibo cancelado', v_doc.file_path, NULL);
    END IF;
  END IF;

  UPDATE public.dp_recibos
     SET cancelado_em = now(),
         link_token_hash = NULL,
         link_expira_em = NULL,
         updated_at = now()
   WHERE id = v_recibo.id;

  PERFORM public.dp_refresh_document_pending(v_recibo.company_id);
END $$;

REVOKE ALL ON FUNCTION public.dp_recibo_cancelar(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_recibo_cancelar(uuid, uuid) TO service_role;