ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS contatos_emergencia jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contatos_confirmados_em timestamptz,
  ADD COLUMN IF NOT EXISTS contatos_confirmados_por uuid,
  ADD COLUMN IF NOT EXISTS contatos_solicitado_em timestamptz;

CREATE OR REPLACE FUNCTION public._dp_contatos_emergencia_validos(_c jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_typeof(_c) = 'array'
    AND jsonb_array_length(_c) BETWEEN 1 AND 2
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(_c) e
      WHERE length(trim(coalesce(e->>'nome',''))) < 3
         OR length(trim(coalesce(e->>'parentesco',''))) = 0
         OR length(regexp_replace(coalesce(e->>'whatsapp',''), '\D', '', 'g')) NOT BETWEEN 10 AND 13
    )
$$;

CREATE OR REPLACE FUNCTION public.dp_portal_meus_contatos()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'colaborador_id', c.id, 'whatsapp', c.whatsapp,
    'contatos_emergencia', c.contatos_emergencia,
    'contatos_confirmados_em', c.contatos_confirmados_em,
    'contatos_solicitado_em', c.contatos_solicitado_em)
  FROM public.dp_colaboradores c
  WHERE c.user_id = auth.uid() AND c.ativo IS TRUE
  ORDER BY c.created_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.dp_portal_confirmar_contatos(_whatsapp text, _contatos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _wa text := regexp_replace(coalesce(_whatsapp,''), '\D', '', 'g');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF length(_wa) NOT BETWEEN 10 AND 13 THEN RAISE EXCEPTION 'Informe seu WhatsApp com DDD'; END IF;
  IF NOT public._dp_contatos_emergencia_validos(_contatos) THEN
    RAISE EXCEPTION 'Informe ao menos 1 contato de emergência com nome, parentesco e WhatsApp (máximo 2)';
  END IF;
  UPDATE public.dp_colaboradores
     SET whatsapp = _wa, contatos_emergencia = _contatos,
         contatos_confirmados_em = now(), contatos_confirmados_por = auth.uid(),
         contatos_solicitado_em = NULL
   WHERE user_id = auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.dp_contatos_solicitar_confirmacao(_colaborador_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cid uuid;
BEGIN
  SELECT company_id INTO _cid FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF _cid IS NULL OR NOT public.tem_permissao(_cid, 'dp.colaboradores', 'edicao') THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.dp_colaboradores SET contatos_solicitado_em = now() WHERE id = _colaborador_id;
END $$;

REVOKE ALL ON FUNCTION public._dp_contatos_emergencia_validos(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_portal_meus_contatos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_portal_confirmar_contatos(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_contatos_solicitar_confirmacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_meus_contatos() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_portal_confirmar_contatos(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_contatos_solicitar_confirmacao(uuid) TO authenticated;