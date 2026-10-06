CREATE OR REPLACE FUNCTION public.dp_ferias_termo_obter(_solicitacao_id uuid DEFAULT NULL, _gozo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_col record; v_det record; v_gozo record; v_sol record; v_emp text;
BEGIN
  IF _gozo_id IS NOT NULL THEN
    SELECT * INTO v_gozo FROM public.dp_ferias_gozos WHERE id = _gozo_id;
    IF v_gozo.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
    _solicitacao_id := COALESCE(_solicitacao_id, v_gozo.solicitacao_id);
  END IF;
  IF _solicitacao_id IS NOT NULL THEN
    SELECT * INTO v_det FROM public.dp_ferias_solicitacao_detalhes WHERE solicitacao_id = _solicitacao_id;
    SELECT * INTO v_sol FROM public.dp_solicitacoes WHERE id = _solicitacao_id;
  END IF;
  SELECT c.id, c.nome, c.cpf, c.user_id, c.company_id INTO v_col FROM public.dp_colaboradores c
  WHERE c.id = COALESCE(v_gozo.colaborador_id, v_det.colaborador_id);
  IF v_col.id IS NULL THEN RAISE EXCEPTION 'FERIAS_NAO_ENCONTRADA'; END IF;
  IF NOT (v_col.user_id = auth.uid() OR private.is_company_admin_or_owner(auth.uid(), v_col.company_id)) THEN
    RAISE EXCEPTION 'FERIAS_SEM_PERMISSAO';
  END IF;
  SELECT COALESCE(name, trade_name) INTO v_emp FROM public.companies WHERE id = v_col.company_id;
  RETURN jsonb_build_object(
    'empresa', v_emp, 'colaborador_nome', v_col.nome, 'colaborador_cpf', v_col.cpf,
    'solicitacao', CASE WHEN v_det.id IS NULL THEN NULL ELSE jsonb_build_object(
      'status', v_sol.status, 'criado_em', v_sol.created_at, 'respondido_em', v_sol.respondido_em,
      'resposta_admin', v_sol.resposta_admin,
      'data_inicio', v_det.data_inicio, 'data_fim', v_det.data_fim, 'dias', v_det.dias,
      'dias_abono', v_det.dias_abono, 'adiantar_13', v_det.adiantar_13, 'observacao', v_det.observacao,
      'ajuste_gestor_de', v_det.ajuste_gestor_de,
      'assinatura', v_det.termo_assinatura_imagem, 'assinado_em', v_det.termo_assinado_em, 'hash', v_det.termo_hash) END,
    'aviso', CASE WHEN v_gozo.id IS NULL THEN NULL ELSE jsonb_build_object(
      'data_inicio', v_gozo.data_inicio, 'data_fim', v_gozo.data_fim, 'dias_abono', v_gozo.dias_abono,
      'aviso_em', v_gozo.aviso_em, 'ajustado_pelo_gestor', v_gozo.ajustado_pelo_gestor,
      'ciente_em', v_gozo.ciente_em, 'assinatura', v_gozo.ciencia_assinatura_imagem) END);
END $$;
REVOKE ALL ON FUNCTION public.dp_ferias_termo_obter(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_ferias_termo_obter(uuid, uuid) TO authenticated;