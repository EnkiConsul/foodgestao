ALTER TABLE public.dp_documentos
  ADD COLUMN IF NOT EXISTS via_assinada_path text,
  ADD COLUMN IF NOT EXISTS via_assinada_nome text,
  ADD COLUMN IF NOT EXISTS via_assinada_mime text,
  ADD COLUMN IF NOT EXISTS via_assinada_em timestamptz,
  ADD COLUMN IF NOT EXISTS via_assinada_por uuid;

CREATE OR REPLACE FUNCTION public.dp_documento_anexar_via_assinada(
  _documento_id uuid, _file_path text, _file_name text, _mime_type text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d record;
  anterior text;
BEGIN
  SELECT id, company_id, exige_aceite, via_assinada_path INTO d
  FROM public.dp_documentos WHERE id = _documento_id FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Documento não encontrado'; END IF;
  IF NOT public.tem_permissao(d.company_id, 'dp.documentos', 'inclusao') THEN
    RAISE EXCEPTION 'Sem permissão para anexar a via assinada';
  END IF;
  IF d.exige_aceite THEN
    RAISE EXCEPTION 'Este documento usa assinatura digital do colaborador';
  END IF;
  IF _file_path IS NULL OR split_part(_file_path, '/', 1) <> d.company_id::text THEN
    RAISE EXCEPTION 'Arquivo fora da pasta da empresa';
  END IF;
  anterior := d.via_assinada_path;
  UPDATE public.dp_documentos SET
    via_assinada_path = _file_path,
    via_assinada_nome = _file_name,
    via_assinada_mime = _mime_type,
    via_assinada_em = now(),
    via_assinada_por = auth.uid()
  WHERE id = _documento_id;
  INSERT INTO public.audit_logs(user_id, action, table_name, record_id, metadata)
  VALUES (auth.uid(), CASE WHEN anterior IS NULL THEN 'dp_via_assinada_anexada' ELSE 'dp_via_assinada_substituida' END,
          'dp_documentos', _documento_id::text,
          jsonb_build_object('company_id', d.company_id, 'anterior', anterior, 'novo', _file_path));
  RETURN anterior;
END $$;

REVOKE ALL ON FUNCTION public.dp_documento_anexar_via_assinada(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_documento_anexar_via_assinada(uuid, text, text, text) TO authenticated, service_role;