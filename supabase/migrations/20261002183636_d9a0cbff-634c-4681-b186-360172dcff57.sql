CREATE TABLE public.dp_documento_comprovantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  documento_id uuid NOT NULL REFERENCES public.dp_documentos(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  mime_type text,
  pago_em date NOT NULL,
  modalidade text NOT NULL CHECK (modalidade IN ('bancario','especie','misto')),
  valor_bancario_cents bigint CHECK (valor_bancario_cents IS NULL OR valor_bancario_cents >= 0),
  valor_especie_cents bigint CHECK (valor_especie_cents IS NULL OR valor_especie_cents >= 0),
  leitura jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CHECK (coalesce(valor_bancario_cents,0) + coalesce(valor_especie_cents,0) > 0)
);
CREATE INDEX dp_documento_comprovantes_doc_idx ON public.dp_documento_comprovantes(documento_id);

GRANT SELECT ON public.dp_documento_comprovantes TO authenticated;
GRANT ALL ON public.dp_documento_comprovantes TO service_role;
ALTER TABLE public.dp_documento_comprovantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin da empresa lê comprovantes complementares"
ON public.dp_documento_comprovantes FOR SELECT TO authenticated
USING (private.dp_doc_admin(company_id));

ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS comprovantes_extra_qtd integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comprovantes_extra_cents bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION private.dp_doc_comprovantes_consolidar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc uuid := coalesce(NEW.documento_id, OLD.documento_id);
BEGIN
  UPDATE public.dp_documentos d SET
    comprovantes_extra_qtd = s.qtd,
    comprovantes_extra_cents = s.total
  FROM (
    SELECT count(*)::int qtd,
           coalesce(sum(coalesce(valor_bancario_cents,0)+coalesce(valor_especie_cents,0)),0)::bigint total
    FROM public.dp_documento_comprovantes WHERE documento_id = v_doc
  ) s
  WHERE d.id = v_doc;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.dp_doc_comprovantes_consolidar() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_dp_doc_comprovantes_consolidar
AFTER INSERT OR UPDATE OR DELETE ON public.dp_documento_comprovantes
FOR EACH ROW EXECUTE FUNCTION private.dp_doc_comprovantes_consolidar();

CREATE OR REPLACE FUNCTION public.dp_comprovante_adicionar(
  p_documento_id uuid, p_arquivo jsonb, p_pago_em date, p_modalidade text,
  p_valor_bancario_cents bigint DEFAULT NULL, p_valor_especie_cents bigint DEFAULT NULL,
  p_leitura jsonb DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_doc public.dp_documentos; v_path text; v_id uuid;
BEGIN
  PERFORM private.dp_doc_campos_conferir(p_arquivo, ARRAY['file_path','file_name','file_size','mime_type']);
  SELECT * INTO v_doc FROM public.dp_documentos WHERE id = p_documento_id FOR UPDATE;
  IF v_doc.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v_doc.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_doc.comprovante_file_path IS NULL THEN RAISE EXCEPTION 'DOC_COMPROVANTE_INEXISTENTE'; END IF;
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
    pago_em, modalidade, valor_bancario_cents, valor_especie_cents, leitura, created_by)
  VALUES (v_doc.company_id, v_doc.id, v_path, p_arquivo->>'file_name', nullif(p_arquivo->>'file_size','')::bigint,
    p_arquivo->>'mime_type', p_pago_em, p_modalidade, p_valor_bancario_cents, p_valor_especie_cents, p_leitura, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_comprovante_adicionar(uuid, jsonb, date, text, bigint, bigint, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_adicionar(uuid, jsonb, date, text, bigint, bigint, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_comprovante_excluir(p_comprovante_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.dp_documento_comprovantes;
BEGIN
  SELECT * INTO v FROM public.dp_documento_comprovantes WHERE id = p_comprovante_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT private.dp_doc_admin(v.company_id) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  DELETE FROM public.dp_documento_comprovantes WHERE id = v.id;
  RETURN v.file_path;
END $$;
REVOKE ALL ON FUNCTION public.dp_comprovante_excluir(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_comprovante_excluir(uuid) TO authenticated, service_role;

-- Reversão: DROP FUNCTION public.dp_comprovante_excluir(uuid); DROP FUNCTION public.dp_comprovante_adicionar(uuid,jsonb,date,text,bigint,bigint,jsonb);
-- DROP TABLE public.dp_documento_comprovantes; ALTER TABLE public.dp_documentos DROP COLUMN comprovantes_extra_qtd, DROP COLUMN comprovantes_extra_cents;