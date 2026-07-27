CREATE OR REPLACE FUNCTION public.dp_editar_desligamento(
  p_colaborador_id uuid,
  p_data_desligamento date,
  p_motivo dp_motivo_desligamento DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_elegibilidade dp_elegibilidade_recontratacao DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_company uuid;
  v_atual date;
  v_ate date;
BEGIN
  SELECT company_id, data_desligamento INTO v_company, v_atual
    FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Colaborador não encontrado'; END IF;
  IF NOT public.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão para editar o desligamento';
  END IF;
  IF v_atual IS NULL THEN
    RAISE EXCEPTION 'Colaborador não está desligado';
  END IF;
  IF p_data_desligamento IS NULL THEN RAISE EXCEPTION 'Data de demissão obrigatória'; END IF;

  UPDATE public.dp_colaboradores
     SET data_desligamento = p_data_desligamento,
         motivo_desligamento = p_motivo,
         observacao_desligamento = NULLIF(btrim(coalesce(p_observacao,'')), ''),
         elegivel_recontratacao = p_elegibilidade,
         acesso_portal_ate = CASE WHEN p_data_desligamento IS DISTINCT FROM v_atual THEN NULL ELSE acesso_portal_ate END
   WHERE id = p_colaborador_id;

  SELECT acesso_portal_ate INTO v_ate FROM public.dp_colaboradores WHERE id = p_colaborador_id;

  RETURN jsonb_build_object('acesso_portal_ate', v_ate);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_editar_desligamento(uuid, date, dp_motivo_desligamento, text, dp_elegibilidade_recontratacao) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_editar_desligamento(uuid, date, dp_motivo_desligamento, text, dp_elegibilidade_recontratacao) TO authenticated;