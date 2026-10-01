-- Quitação do pagamento: modalidade (bancário, espécie, misto), valores e recibo.

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS comprovante_modalidade text,
  ADD COLUMN IF NOT EXISTS comprovante_valor_bancario_cents bigint,
  ADD COLUMN IF NOT EXISTS comprovante_valor_especie_cents bigint,
  ADD COLUMN IF NOT EXISTS comprovante_recibo_documento_id uuid,
  ADD COLUMN IF NOT EXISTS comprovante_leitura jsonb;

ALTER TABLE public.dp_documentos
  DROP CONSTRAINT IF EXISTS dp_documentos_comprovante_modalidade_chk;
ALTER TABLE public.dp_documentos
  ADD CONSTRAINT dp_documentos_comprovante_modalidade_chk
  CHECK (comprovante_modalidade IS NULL OR comprovante_modalidade IN ('bancario','especie','misto'));

ALTER TABLE public.dp_documentos
  DROP CONSTRAINT IF EXISTS dp_documentos_comprovante_valores_chk;
ALTER TABLE public.dp_documentos
  ADD CONSTRAINT dp_documentos_comprovante_valores_chk
  CHECK (
    coalesce(comprovante_valor_bancario_cents, 0) >= 0
    AND coalesce(comprovante_valor_especie_cents, 0) >= 0
  );

ALTER TABLE public.dp_documentos
  DROP CONSTRAINT IF EXISTS dp_documentos_comprovante_recibo_fk;
ALTER TABLE public.dp_documentos
  ADD CONSTRAINT dp_documentos_comprovante_recibo_fk
  FOREIGN KEY (comprovante_recibo_documento_id)
  REFERENCES public.dp_documentos(id) ON DELETE SET NULL;

-- Guarda fail-closed: sem arquivo não sobra dado de quitação; ao trocar o
-- arquivo a data e a modalidade são obrigatórias e coerentes entre si.
CREATE OR REPLACE FUNCTION private.dp_documento_comprovante_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
BEGIN
  IF NEW.comprovante_file_path IS NULL THEN
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

-- Rotina de anexo: agora também grava modalidade, valores e o que foi lido
-- automaticamente do comprovante. A data do pagamento passa a ser obrigatória.
DROP FUNCTION IF EXISTS public.dp_comprovante_anexar(uuid, jsonb, date, boolean);

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
  IF v_doc.referencia_data IS NOT NULL
     AND date_trunc('month', p_pago_em) <> date_trunc('month', v_doc.referencia_data)
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

-- Liga o recibo de pagamento em espécie ao documento pago.
CREATE OR REPLACE FUNCTION public.dp_comprovante_recibo_vincular(
  p_documento_id uuid,
  p_recibo_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF v_recibo.tipo <> 'recibo_pagamento_especie'::public.dp_documento_tipo THEN
    RAISE EXCEPTION 'DOC_RECIBO_TIPO_INVALIDO';
  END IF;
  IF v_recibo.colaborador_id IS DISTINCT FROM v_doc.colaborador_id THEN
    RAISE EXCEPTION 'DOC_RECIBO_COLABORADOR_DIVERGENTE';
  END IF;

  IF v_doc.comprovante_recibo_documento_id IS NOT DISTINCT FROM p_recibo_id THEN
    RETURN;
  END IF;

  UPDATE public.dp_documentos
     SET comprovante_recibo_documento_id = p_recibo_id,
         updated_at = now()
   WHERE id = v_doc.id;

  PERFORM private.dp_doc_evento(v_doc, 'comprovante_recibo_vinculado', NULL, NULL, v_recibo.file_path);
END $function$;

REVOKE ALL ON FUNCTION public.dp_comprovante_recibo_vincular(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_recibo_vincular(uuid, uuid) TO authenticated, service_role;