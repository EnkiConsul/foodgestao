REVOKE ALL ON FUNCTION public.dp_solicitar_complemento_clt(uuid, text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_solicitar_complemento_clt(uuid, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_solicitar_complemento_clt(
  p_colaborador_id uuid,
  p_itens text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab record;
  v_solicitacao_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Acesso negado. Usuário não autenticado.';
  END IF;

  SELECT c.id, c.company_id, c.nome, c.ativo
    INTO v_colab
    FROM dp_colaboradores c
   WHERE c.id = p_colaborador_id;

  IF v_colab.id IS NULL OR NOT (
    private.is_company_admin_or_owner(auth.uid(), v_colab.company_id)
    OR public.tem_permissao(v_colab.company_id, 'dp.colaboradores', 'alteracao')
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Colaborador não encontrado ou sem permissão de acesso.';
  END IF;

  IF NOT v_colab.ativo THEN
    RAISE EXCEPTION 'Colaborador desligado não pode receber solicitações.';
  END IF;

  IF p_itens IS NULL OR array_length(p_itens, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um documento a solicitar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM dp_solicitacoes s
     WHERE s.colaborador_id = p_colaborador_id
       AND s.tipo = 'complemento_clt'
       AND s.status IN ('pendente', 'em_andamento')
  ) THEN
    RAISE EXCEPTION 'Já existe uma solicitação de complemento em aberto para este colaborador.';
  END IF;

  INSERT INTO dp_solicitacoes (company_id, colaborador_id, tipo, itens, status, solicitado_por)
  VALUES (v_colab.company_id, p_colaborador_id, 'complemento_clt', to_jsonb(p_itens), 'pendente', auth.uid())
  RETURNING id INTO v_solicitacao_id;

  INSERT INTO dp_notificacoes (company_id, colaborador_id, tipo, titulo, mensagem, dados)
  VALUES (
    v_colab.company_id,
    p_colaborador_id,
    'complemento_clt',
    'Documentos solicitados',
    'A empresa solicitou o envio de documentos para atualização do seu cadastro.',
    jsonb_build_object('solicitacao_id', v_solicitacao_id)
  );

  RETURN v_solicitacao_id;
END;
$$;