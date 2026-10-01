ALTER TABLE public.dp_registros_disciplinares
  ADD COLUMN IF NOT EXISTS via_assinada_historico jsonb NOT NULL DEFAULT '[]'::jsonb;

DROP FUNCTION IF EXISTS public.dp_registro_disciplinar_via_assinada(uuid,text,boolean);

CREATE OR REPLACE FUNCTION public.dp_registro_disciplinar_via_assinada(p_registro_id uuid, p_path text, p_confirmo_aplicacao boolean, p_motivo_troca text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT * INTO r FROM public.dp_registros_disciplinares WHERE id = p_registro_id AND removido_em IS NULL FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (private.is_company_admin_or_owner(auth.uid(), r.company_id)
          OR public.tem_permissao(r.company_id, 'dp.ocorrencias', 'inclusao')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF r.tipo::text NOT IN ('advertencia_escrita','suspensao') THEN RAISE EXCEPTION 'DISC_TIPO_SEM_VIA'; END IF;
  IF p_confirmo_aplicacao IS NOT TRUE THEN RAISE EXCEPTION 'DISC_CONFIRMACAO_OBRIGATORIA'; END IF;
  IF COALESCE(btrim(p_path),'') = '' OR left(p_path, length(r.company_id::text) + 1) <> r.company_id::text || '/' THEN
    RAISE EXCEPTION 'DISC_ARQUIVO_INVALIDO';
  END IF;
  IF r.via_assinada_path IS NOT NULL THEN
    IF length(btrim(COALESCE(p_motivo_troca,''))) < 5 THEN RAISE EXCEPTION 'DISC_MOTIVO_TROCA_OBRIGATORIO'; END IF;
    IF r.via_assinada_path = p_path THEN RAISE EXCEPTION 'DISC_ARQUIVO_INVALIDO'; END IF;
  END IF;
  UPDATE public.dp_registros_disciplinares
     SET via_assinada_historico = CASE WHEN r.via_assinada_path IS NULL THEN via_assinada_historico
           ELSE via_assinada_historico || jsonb_build_array(jsonb_build_object(
             'path', r.via_assinada_path, 'importada_em', r.via_assinada_em, 'importada_por', r.via_assinada_por,
             'substituida_em', now(), 'substituida_por', auth.uid(), 'motivo', btrim(p_motivo_troca))) END,
         via_assinada_path = p_path, via_assinada_em = now(), via_assinada_por = auth.uid(), updated_at = now()
   WHERE id = p_registro_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_registro_disciplinar_via_assinada(uuid,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_registro_disciplinar_via_assinada(uuid,text,boolean,text) TO authenticated, service_role;