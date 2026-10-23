CREATE OR REPLACE FUNCTION public.dp_folga_substituir_pedido(
  p_id uuid, p_modo text, p_data date, p_data_trabalho date, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.dp_solicitacoes%ROWTYPE; v_colab uuid;
BEGIN
  v_colab := public.dp_colaborador_ativo_of(auth.uid());
  SELECT * INTO s FROM public.dp_solicitacoes WHERE id = p_id AND removido_em IS NULL FOR UPDATE;
  IF NOT FOUND OR v_colab IS NULL OR s.colaborador_id <> v_colab THEN RAISE EXCEPTION 'NAO_ENCONTRADA'; END IF;
  IF s.status <> 'pendente' OR s.tipo <> 'folga' THEN RAISE EXCEPTION 'STATUS_INVALIDO'; END IF;
  -- Encerra o pedido anterior e cria o novo na mesma transação: se o novo falhar, nada muda.
  UPDATE public.dp_solicitacoes
     SET status = 'cancelada',
         resposta_admin = coalesce(resposta_admin, 'Substituído pelo colaborador por um novo pedido'),
         devolvido_em = NULL, devolvido_motivo = NULL
   WHERE id = p_id;
  IF p_modo = 'troca' THEN
    PERFORM public.dp_folga_troca_fds_solicitar(p_data, p_data_trabalho, p_motivo);
  ELSE
    PERFORM public.dp_folga_solicitar(p_data, p_motivo, true);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.dp_folga_substituir_pedido(uuid,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_folga_substituir_pedido(uuid,text,date,date,text) TO authenticated, service_role;