ALTER TABLE public.dp_registros_disciplinares
  ADD COLUMN IF NOT EXISTS via_assinada_path text,
  ADD COLUMN IF NOT EXISTS via_assinada_em timestamptz,
  ADD COLUMN IF NOT EXISTS via_assinada_por uuid;

CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_via_assinada(p_registro_id uuid, p_path text, p_confirmo_aplicacao boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.dp_registros_disciplinares WHERE id = p_registro_id AND removido_em IS NULL;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), r.company_id)
          OR public.tem_permissao(r.company_id, 'dp.ocorrencias', 'inclusao')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF r.tipo::text NOT IN ('advertencia_escrita','suspensao') THEN RAISE EXCEPTION 'DISC_TIPO_SEM_VIA'; END IF;
  IF p_confirmo_aplicacao IS NOT TRUE THEN RAISE EXCEPTION 'DISC_CONFIRMACAO_OBRIGATORIA'; END IF;
  IF r.via_assinada_path IS NOT NULL THEN RAISE EXCEPTION 'DISC_VIA_JA_IMPORTADA'; END IF;
  IF COALESCE(btrim(p_path),'') = '' OR left(p_path, length(r.company_id::text) + 1) <> r.company_id::text || '/' THEN
    RAISE EXCEPTION 'DISC_ARQUIVO_INVALIDO';
  END IF;
  UPDATE public.dp_registros_disciplinares
     SET via_assinada_path = p_path, via_assinada_em = now(), via_assinada_por = auth.uid(), updated_at = now()
   WHERE id = p_registro_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_via_assinada(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_via_assinada(uuid,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_portal_meus_disciplinares()
RETURNS TABLE(id uuid, tipo text, data date, suspensao_dias integer, via_assinada_path text, via_assinada_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT r.id, r.tipo::text, r.data, r.suspensao_dias, r.via_assinada_path, r.via_assinada_em
    FROM public.dp_registros_disciplinares r
    JOIN public.dp_colaboradores c ON c.id = r.colaborador_id
   WHERE c.user_id = auth.uid()
     AND auth.uid() IS NOT NULL
     AND r.removido_em IS NULL
     AND r.via_assinada_path IS NOT NULL
     AND r.tipo::text IN ('advertencia_escrita','suspensao')
   ORDER BY r.data DESC
$$;
REVOKE ALL ON FUNCTION public.dp_portal_meus_disciplinares() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_meus_disciplinares() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.dp_disciplinar_via_do_usuario(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_registros_disciplinares r
      JOIN public.dp_colaboradores c ON c.id = r.colaborador_id
     WHERE r.via_assinada_path = _name AND r.removido_em IS NULL
       AND c.user_id = auth.uid() AND auth.uid() IS NOT NULL)
$$;
GRANT EXECUTE ON FUNCTION private.dp_disciplinar_via_do_usuario(text) TO authenticated;

DROP POLICY IF EXISTS dp_disciplinar_via_colaborador_read ON storage.objects;
CREATE POLICY dp_disciplinar_via_colaborador_read ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'dp-disciplinar' AND private.dp_disciplinar_via_do_usuario(name));