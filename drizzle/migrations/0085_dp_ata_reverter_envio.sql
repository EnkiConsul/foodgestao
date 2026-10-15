CREATE OR REPLACE FUNCTION public.dp_ata_reverter_envio(p_ata_id uuid, p_excluir boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ata record;
  v_assinados int;
  v_docs uuid[];
BEGIN
  SELECT id, company_id, status INTO v_ata FROM public.dp_atas WHERE id = p_ata_id FOR UPDATE;
  IF v_ata.id IS NULL THEN RAISE EXCEPTION 'ATA_NAO_ENCONTRADA'; END IF;
  IF NOT public.tem_permissao(v_ata.company_id, 'dp.documentos', CASE WHEN p_excluir THEN 'exclusao' ELSE 'alteracao' END) THEN
    RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(documento_id) FILTER (WHERE documento_id IS NOT NULL) INTO v_docs
    FROM public.dp_ata_participantes WHERE ata_id = p_ata_id;

  SELECT count(*) INTO v_assinados FROM (
    SELECT 1 FROM public.dp_documento_aceites ac WHERE ac.documento_id = ANY(coalesce(v_docs, '{}'::uuid[])) AND ac.aceito_em IS NOT NULL
    UNION ALL
    SELECT 1 FROM public.dp_ata_participantes p WHERE p.ata_id = p_ata_id AND p.assinado_em IS NOT NULL
  ) s;
  IF v_assinados > 0 THEN RAISE EXCEPTION 'ATA_JA_ASSINADA'; END IF;

  -- Documentos do portal são arquivados (histórico preservado), nunca apagados.
  IF v_docs IS NOT NULL THEN
    UPDATE public.dp_documentos
       SET arquivado_em = now(), arquivado_por = auth.uid(),
           arquivamento_motivo = CASE WHEN p_excluir THEN 'Ata excluída antes de qualquer assinatura' ELSE 'Envio da ata cancelado antes de qualquer assinatura' END
     WHERE id = ANY(v_docs) AND arquivado_em IS NULL;
  END IF;

  IF p_excluir THEN
    DELETE FROM public.dp_ata_participantes WHERE ata_id = p_ata_id;
    DELETE FROM public.dp_atas WHERE id = p_ata_id;
  ELSE
    UPDATE public.dp_ata_participantes
       SET documento_id = NULL, arquivo_path = NULL, link_token_hash = NULL, link_expira_em = NULL
     WHERE ata_id = p_ata_id;
    UPDATE public.dp_atas SET status = 'rascunho', enviada_em = NULL, enviada_por = NULL WHERE id = p_ata_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'documentos_arquivados', coalesce(array_length(v_docs, 1), 0));
END;
$$;
REVOKE ALL ON FUNCTION public.dp_ata_reverter_envio(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_ata_reverter_envio(uuid, boolean) TO authenticated, service_role;