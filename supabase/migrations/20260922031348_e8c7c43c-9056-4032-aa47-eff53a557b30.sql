-- Fase 1 — Documentos, versionamento e aceites (Pessoas 360)

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS arquivo_sha256 text,
  ADD COLUMN IF NOT EXISTS arquivo_sha256_em timestamptz;

ALTER TABLE public.dp_documento_aceites
  ADD COLUMN IF NOT EXISTS documento_versao integer,
  ADD COLUMN IF NOT EXISTS hash_origem text,
  ADD COLUMN IF NOT EXISTS documento_snapshot jsonb;

-- Backfill somente de marcação: nenhum dado histórico é apagado ou reescrito.
UPDATE public.dp_documento_aceites a
   SET hash_origem = 'legado_caminho',
       documento_versao = COALESCE(a.documento_versao, d.versao, 1)
  FROM public.dp_documentos d
 WHERE d.id = a.documento_id
   AND a.hash_origem IS NULL;

UPDATE public.dp_documento_aceites
   SET hash_origem = 'legado_caminho'
 WHERE hash_origem IS NULL;

-- Unicidade dos aceites novos (documento + signatário). Registros legados
-- permanecem intactos, inclusive eventual duplicidade histórica.
CREATE UNIQUE INDEX IF NOT EXISTS dp_documento_aceites_unico_signatario
  ON public.dp_documento_aceites (documento_id, aceito_por)
  WHERE documento_id IS NOT NULL
    AND aceito_por IS NOT NULL
    AND hash_origem = 'sha256_conteudo';

CREATE INDEX IF NOT EXISTS dp_documento_aceites_documento_idx
  ON public.dp_documento_aceites (documento_id);

-- Coerência obrigatória: empresa + titular + documento, em qualquer caminho.
CREATE OR REPLACE FUNCTION public.dp_documento_aceite_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc public.dp_documentos;
  v_comp uuid;
BEGIN
  IF NEW.documento_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = NEW.documento_id;
  IF v_doc.id IS NULL THEN
    RAISE EXCEPTION 'documento_inexistente';
  END IF;
  IF v_doc.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'documento_de_outra_empresa';
  END IF;
  IF v_doc.colaborador_id IS NULL OR v_doc.colaborador_id IS DISTINCT FROM NEW.colaborador_id THEN
    RAISE EXCEPTION 'documento_de_outro_colaborador';
  END IF;

  SELECT company_id INTO v_comp FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_comp IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'colaborador_de_outra_empresa';
  END IF;

  NEW.documento_versao := COALESCE(NEW.documento_versao, v_doc.versao, 1);
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_dp_documento_aceite_guard ON public.dp_documento_aceites;
CREATE TRIGGER trg_dp_documento_aceite_guard
BEFORE INSERT OR UPDATE ON public.dp_documento_aceites
FOR EACH ROW EXECUTE FUNCTION public.dp_documento_aceite_guard();

-- Versão já aceita é imutável: novo conteúdo exige nova versão.
CREATE OR REPLACE FUNCTION public.dp_documento_versao_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dp_documento_aceites WHERE documento_id = OLD.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.file_path IS DISTINCT FROM OLD.file_path
     OR NEW.file_size IS DISTINCT FROM OLD.file_size
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.colaborador_id IS DISTINCT FROM OLD.colaborador_id
     OR NEW.tipo IS DISTINCT FROM OLD.tipo
     OR NEW.referencia_data IS DISTINCT FROM OLD.referencia_data THEN
    RAISE EXCEPTION 'versao_aceita_imutavel';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_dp_documento_versao_imutavel ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_versao_imutavel
BEFORE UPDATE ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION public.dp_documento_versao_imutavel();

-- Evidência preservada mesmo se o documento for excluído.
CREATE OR REPLACE FUNCTION public.dp_documento_aceite_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.dp_documento_aceites a
     SET documento_snapshot = COALESCE(a.documento_snapshot, jsonb_build_object(
           'documento_id', OLD.id,
           'titulo', OLD.titulo,
           'tipo', OLD.tipo::text,
           'competencia', to_char(OLD.referencia_data, 'YYYY-MM'),
           'versao', OLD.versao,
           'file_name', OLD.file_name,
           'file_path', OLD.file_path,
           'arquivo_sha256', OLD.arquivo_sha256,
           'excluido_em', now()
         ))
   WHERE a.documento_id = OLD.id;
  RETURN OLD;
END $function$;

DROP TRIGGER IF EXISTS trg_dp_documento_aceite_snapshot ON public.dp_documentos;
CREATE TRIGGER trg_dp_documento_aceite_snapshot
BEFORE DELETE ON public.dp_documentos
FOR EACH ROW EXECUTE FUNCTION public.dp_documento_aceite_snapshot();

-- Porta única de registro do aceite.
CREATE OR REPLACE FUNCTION public.dp_documento_aceitar(
  _documento_id uuid,
  _user_agent text DEFAULT NULL,
  _ip text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_colab_company uuid;
  v_doc public.dp_documentos;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado';
  END IF;

  v_colab := public.dp_colaborador_ativo_of(v_uid);
  IF v_colab IS NULL THEN
    RAISE EXCEPTION 'sem_acesso_portal';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_documento_id::text, 0));

  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = _documento_id;
  IF v_doc.id IS NULL
     OR v_doc.colaborador_id IS DISTINCT FROM v_colab
     OR v_doc.arquivado_em IS NOT NULL
     OR COALESCE(v_doc.ciclo_status, 'ativo') <> 'ativo'
     OR COALESCE(v_doc.aprovacao_status::text, 'aprovado') <> 'aprovado' THEN
    RAISE EXCEPTION 'documento_indisponivel';
  END IF;

  SELECT company_id INTO v_colab_company FROM public.dp_colaboradores WHERE id = v_colab;
  IF v_colab_company IS DISTINCT FROM v_doc.company_id THEN
    RAISE EXCEPTION 'documento_indisponivel';
  END IF;

  IF COALESCE(v_doc.exige_aceite, false) = false THEN
    RAISE EXCEPTION 'documento_nao_exige_aceite';
  END IF;
  IF v_doc.file_path IS NULL THEN
    RAISE EXCEPTION 'documento_sem_arquivo';
  END IF;
  IF v_doc.arquivo_sha256 IS NULL OR length(v_doc.arquivo_sha256) <> 64 THEN
    RAISE EXCEPTION 'conteudo_nao_conferido';
  END IF;

  SELECT id INTO v_id
    FROM public.dp_documento_aceites
   WHERE documento_id = _documento_id
     AND aceito_por = v_uid
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.dp_documento_aceites (
    company_id, colaborador_id, documento_id, modelo, modelo_versao,
    conteudo_hash, aceito_por, ip, user_agent, documento_versao, hash_origem
  ) VALUES (
    v_doc.company_id, v_colab, _documento_id, v_doc.tipo::text,
    'v' || COALESCE(v_doc.versao, 1)::text,
    v_doc.arquivo_sha256, v_uid, NULLIF(btrim(COALESCE(_ip, '')), ''),
    NULLIF(left(COALESCE(_user_agent, ''), 500), ''),
    COALESCE(v_doc.versao, 1), 'sha256_conteudo'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.dp_documento_aceitar(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_documento_aceitar(uuid, text, text) TO authenticated, service_role;

-- O colaborador passa a registrar aceite somente pela operação de servidor.
DROP POLICY IF EXISTS dp_doc_aceites_self_insert ON public.dp_documento_aceites;

-- Aceite é histórico: a aplicação não apaga evidência.
REVOKE DELETE ON public.dp_documento_aceites FROM authenticated;
GRANT SELECT, INSERT ON public.dp_documento_aceites TO authenticated;
GRANT ALL ON public.dp_documento_aceites TO service_role;