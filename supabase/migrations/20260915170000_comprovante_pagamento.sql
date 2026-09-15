-- Comprovante de pagamento anexado ao documento de pagamento.
-- Segundo arquivo por documento, gravado apenas por quem administra a empresa e
-- visível para o colaborador titular. Cobrança opcional via pendências.

-- 1. Colunas do comprovante
ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS comprovante_file_path text,
  ADD COLUMN IF NOT EXISTS comprovante_file_name text,
  ADD COLUMN IF NOT EXISTS comprovante_file_size bigint,
  ADD COLUMN IF NOT EXISTS comprovante_mime_type text,
  ADD COLUMN IF NOT EXISTS comprovante_pago_em date,
  ADD COLUMN IF NOT EXISTS comprovante_uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS comprovante_uploaded_at timestamptz;

CREATE INDEX IF NOT EXISTS dp_documentos_comprovante_pendente_idx
  ON public.dp_documentos (company_id, referencia_data)
  WHERE comprovante_file_path IS NULL AND ciclo_status = 'ativo';

-- 2. Tipos de documento que aceitam comprovante (fonte única no banco)
CREATE OR REPLACE FUNCTION public.dp_documento_aceita_comprovante(_tipo public.dp_documento_tipo)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT _tipo = ANY (ARRAY[
    'contracheque','contracheque_13','contracheque_ferias','recibo_ferias','aviso_ferias',
    'adiantamento','trct','demonstrativo_rescisorio','plr','pro_labore','outros_pagamentos','ferias'
  ]::public.dp_documento_tipo[])
$$;

REVOKE ALL ON FUNCTION public.dp_documento_aceita_comprovante(public.dp_documento_tipo) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_aceita_comprovante(public.dp_documento_tipo) TO authenticated, service_role;

-- 3. Guarda fail-closed do comprovante
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
    RETURN NEW;
  END IF;

  IF NOT public.dp_documento_aceita_comprovante(NEW.tipo) THEN
    RAISE EXCEPTION 'Este tipo de documento não aceita comprovante de pagamento';
  END IF;

  IF NEW.submetido_por_colaborador THEN
    RAISE EXCEPTION 'Comprovante de pagamento só pode ser anexado pela empresa';
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.comprovante_file_path IS DISTINCT FROM NEW.comprovante_file_path THEN
    NEW.comprovante_uploaded_at := now();
    NEW.comprovante_uploaded_by := COALESCE(NEW.comprovante_uploaded_by, auth.uid());
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.dp_documento_comprovante_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_documento_comprovante_guard ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_comprovante_guard
  BEFORE INSERT OR UPDATE ON public.dp_documentos
  FOR EACH ROW EXECUTE FUNCTION private.dp_documento_comprovante_guard();

-- 4. Link autorizado também para o comprovante (mesma checagem de acesso)
CREATE OR REPLACE FUNCTION public.dp_documento_arquivo(_documento_id uuid, _variante text DEFAULT 'documento')
RETURNS TABLE(file_path text, file_name text, mime_type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos;
  v_colab uuid;
  v_path text;
  v_name text;
  v_mime text;
BEGIN
  IF _variante NOT IN ('documento','comprovante') THEN
    RETURN;
  END IF;

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id;
  IF v_doc.id IS NULL THEN
    RETURN; -- não revela se o documento existe em outra empresa
  END IF;

  IF _variante = 'comprovante' THEN
    v_path := v_doc.comprovante_file_path;
    v_name := v_doc.comprovante_file_name;
    v_mime := v_doc.comprovante_mime_type;
  ELSE
    v_path := v_doc.file_path;
    v_name := v_doc.file_name;
    v_mime := v_doc.mime_type;
  END IF;

  IF v_path IS NULL THEN
    RETURN;
  END IF;

  IF private.is_company_admin_or_owner(auth.uid(), v_doc.company_id)
     OR public.is_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT v_path, v_name, v_mime;
    RETURN;
  END IF;

  v_colab := public.dp_colaborador_of(auth.uid());
  IF v_colab IS NOT NULL
     AND v_doc.colaborador_id = v_colab
     AND v_doc.tipo <> 'disciplinar'::dp_documento_tipo
     AND v_doc.ciclo_status IN ('ativo','arquivado') THEN
    RETURN QUERY SELECT v_path, v_name, v_mime;
  END IF;

  RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.dp_documento_arquivo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_arquivo(uuid, text) TO authenticated, service_role;

-- 5. Configuração da pendência de comprovante (ligada por padrão)
ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS exigir_comprovante_pagamento boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS alerta_comprovante_dias smallint NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS comprovante_vigencia_inicio date NOT NULL DEFAULT '2026-09-01';
