ALTER TYPE public.dp_solicitacao_tipo ADD VALUE IF NOT EXISTS 'documento';
ALTER TYPE public.dp_notificacao_tipo ADD VALUE IF NOT EXISTS 'documento_complemento';

CREATE OR REPLACE FUNCTION public.dp_solicitar_complemento_clt(
  p_colaborador_id uuid,
  p_itens text[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_colab record;
  v_sol_id uuid;
  v_lista text;
BEGIN
  SELECT id, company_id, nome, user_id, ativo
    INTO v_colab
    FROM public.dp_colaboradores
   WHERE id = p_colaborador_id;

  IF v_colab.id IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado.';
  END IF;
  IF NOT v_colab.ativo THEN
    RAISE EXCEPTION 'Colaborador desligado não pode receber solicitações.';
  END IF;
  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_colab.company_id)
    OR public.tem_permissao(v_colab.company_id, 'dp.colaboradores', 'alteracao')
    OR public.is_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Sem permissão para solicitar documentos deste colaborador.';
  END IF;
  IF p_itens IS NULL OR array_length(p_itens, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um documento ou dado a complementar.';
  END IF;

  v_lista := array_to_string(p_itens, ', ');

  SELECT id INTO v_sol_id
    FROM public.dp_solicitacoes
   WHERE colaborador_id = p_colaborador_id
     AND tipo = 'documento'
     AND status = 'pendente'
     AND removido_em IS NULL
     AND motivo = v_lista
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_sol_id IS NULL THEN
    INSERT INTO public.dp_solicitacoes (
      company_id, colaborador_id, criado_por, tipo, motivo, status
    ) VALUES (
      v_colab.company_id, p_colaborador_id, auth.uid(), 'documento', v_lista, 'pendente'
    ) RETURNING id INTO v_sol_id;
  END IF;

  IF v_colab.user_id IS NOT NULL THEN
    INSERT INTO public.dp_notificacoes (
      company_id, user_id, colaborador_id, tipo, titulo, descricao,
      ref_table, ref_id, para_admins, chave
    ) VALUES (
      v_colab.company_id, v_colab.user_id, p_colaborador_id,
      'documento_complemento',
      'Documentos solicitados pelo DP',
      'Para concluir seu registro, envie: ' || v_lista || '. Toque para abrir seus documentos.',
      'dp_solicitacoes', v_sol_id, false,
      'complemento_clt:' || v_sol_id::text
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_sol_id;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_solicitar_complemento_clt(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_solicitar_complemento_clt(uuid, text[]) TO authenticated, service_role;