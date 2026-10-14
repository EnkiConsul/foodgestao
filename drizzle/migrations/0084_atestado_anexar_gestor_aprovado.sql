CREATE OR REPLACE FUNCTION public.dp_solicitacao_anexar_gestor(p_id uuid, p_arquivo_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dp_solicitacoes%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id AND removido_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NAO_ENCONTRADA'; END IF;
  IF NOT public.tem_permissao(s.company_id, 'dp.folgas', 'alteracao') THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE='42501'; END IF;
  IF s.status = 'pendente' THEN
    NULL;
  ELSIF s.status = 'aprovada' AND (s.tipo::text = 'atestado' OR s.tipo::text LIKE 'licenca%') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'STATUS_INVALIDO';
  END IF;
  IF p_arquivo_path IS NULL OR split_part(p_arquivo_path,'/',1) <> s.company_id::text OR split_part(p_arquivo_path,'/',2) <> s.colaborador_id::text THEN
    RAISE EXCEPTION 'CAMINHO_INVALIDO';
  END IF;
  UPDATE public.dp_solicitacoes SET arquivo_path = p_arquivo_path, devolvido_em = NULL, devolvido_motivo = NULL, updated_at = now() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.dp_solicitacao_anexar_gestor(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_anexar_gestor(uuid, text) TO authenticated, service_role;