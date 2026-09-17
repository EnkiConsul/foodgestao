CREATE OR REPLACE FUNCTION public.dp_preadmissao_anexar_somente(
  p_preadmissao_id uuid,
  p_item_id uuid,
  p_por uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pa record;
  it record;
  v_cpf text;
  v_cpf_item text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('dp_preadmissao:' || p_preadmissao_id::text, 0));
  SELECT * INTO pa FROM public.dp_preadmissoes WHERE id = p_preadmissao_id FOR UPDATE;
  IF pa.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  END IF;
  IF pa.colaborador_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_concluida');
  END IF;
  IF pa.status NOT IN ('enviado_contabilidade','aguardando_retorno_contabilidade','registro_recebido') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'fase_invalida', 'status', pa.status);
  END IF;

  SELECT * INTO it FROM public.dp_ficha_importacao_itens WHERE id = p_item_id;
  IF it.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'item_nao_encontrado');
  END IF;
  IF it.company_id <> pa.company_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'item_outra_empresa');
  END IF;

  v_cpf := regexp_replace(COALESCE(pa.cpf, pa.dados->>'cpf', ''), '\D', '', 'g');
  v_cpf_item := regexp_replace(COALESCE(it.dados_extraidos->>'cpf', ''), '\D', '', 'g');
  IF length(v_cpf_item) = 11 AND length(v_cpf) = 11 AND v_cpf_item <> v_cpf THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'cpf_diferente');
  END IF;

  INSERT INTO public.dp_preadmissao_eventos (preadmissao_id, company_id, evento, detalhe, actor_user_id)
  VALUES (
    pa.id, pa.company_id, 'ficha_somente_anexada',
    jsonb_build_object('ficha_importacao_item_id', it.id, 'arquivo_path', it.arquivo_path),
    p_por
  );

  RETURN jsonb_build_object('ok', true, 'status', pa.status, 'ficha_importacao_item_id', it.id);
END;
$$;

REVOKE ALL ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid) TO service_role;
