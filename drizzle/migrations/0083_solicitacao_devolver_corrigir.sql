CREATE OR REPLACE FUNCTION public.dp_solicitacao_devolver(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dp_solicitacoes%ROWTYPE; v_user uuid;
BEGIN
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id AND removido_em IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NAO_ENCONTRADA'; END IF;
  IF NOT public.tem_permissao(s.company_id, 'dp.folgas', 'alteracao') THEN RAISE EXCEPTION 'SEM_PERMISSAO' USING ERRCODE='42501'; END IF;
  IF s.status <> 'pendente' THEN RAISE EXCEPTION 'STATUS_INVALIDO'; END IF;
  IF length(btrim(coalesce(p_motivo,''))) < 3 THEN RAISE EXCEPTION 'MOTIVO_OBRIGATORIO'; END IF;
  UPDATE public.dp_solicitacoes SET devolvido_em = now(), devolvido_motivo = btrim(p_motivo), updated_at = now() WHERE id = p_id;
  SELECT c.user_id INTO v_user FROM public.dp_colaboradores c WHERE c.id = s.colaborador_id;
  INSERT INTO public.dp_notificacoes (company_id, user_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (s.company_id, v_user, s.colaborador_id, 'solicitacao_respondida', 'Solicitação devolvida para correção', btrim(p_motivo), 'dp_solicitacoes', s.id, false);
END $$;

CREATE OR REPLACE FUNCTION public.dp_solicitacao_corrigir_reenviar(
  p_id uuid, p_data_alvo date, p_data_fim date, p_motivo text, p_arquivo_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dp_solicitacoes%ROWTYPE; v_colab uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id AND removido_em IS NULL FOR UPDATE;
  IF NOT FOUND OR v_colab IS NULL OR s.colaborador_id <> v_colab THEN RAISE EXCEPTION 'NAO_ENCONTRADA'; END IF;
  IF s.status <> 'pendente' OR s.devolvido_em IS NULL THEN RAISE EXCEPTION 'STATUS_INVALIDO'; END IF;
  IF p_data_alvo IS NULL OR (p_data_fim IS NOT NULL AND p_data_fim < p_data_alvo) THEN RAISE EXCEPTION 'PERIODO_INVALIDO'; END IF;
  IF p_arquivo_path IS NOT NULL AND (split_part(p_arquivo_path,'/',1) <> s.company_id::text OR split_part(p_arquivo_path,'/',2) <> s.colaborador_id::text) THEN
    RAISE EXCEPTION 'CAMINHO_INVALIDO';
  END IF;
  UPDATE public.dp_solicitacoes SET
    data_alvo = p_data_alvo,
    data_fim = p_data_fim,
    motivo = NULLIF(btrim(coalesce(p_motivo,'')), ''),
    arquivo_path = coalesce(p_arquivo_path, arquivo_path),
    devolvido_em = NULL, devolvido_motivo = NULL, updated_at = now()
  WHERE id = p_id;
  INSERT INTO public.dp_notificacoes (company_id, colaborador_id, tipo, titulo, descricao, ref_table, ref_id, para_admins)
  VALUES (s.company_id, s.colaborador_id, 'atestado_novo', 'Solicitação corrigida e reenviada', NULL, 'dp_solicitacoes', s.id, true);
END $$;

REVOKE ALL ON FUNCTION public.dp_solicitacao_corrigir_reenviar(uuid,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_solicitacao_corrigir_reenviar(uuid,date,date,text,text) TO authenticated, service_role;