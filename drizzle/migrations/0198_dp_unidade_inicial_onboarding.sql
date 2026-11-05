CREATE OR REPLACE FUNCTION public.dp_criar_unidade_inicial(p_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_c public.companies%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'nao_autenticado'; END IF;
  SELECT * INTO v_c FROM public.companies WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'empresa_nao_encontrada'; END IF;
  IF v_c.user_id <> auth.uid() AND NOT public.tem_permissao(p_company_id, 'dp.unidades', 'inclusao') THEN
    RAISE EXCEPTION 'sem_permissao';
  END IF;
  -- Idempotente: só cria se a empresa ainda não tiver unidade
  SELECT id INTO v_id FROM public.dp_unidades WHERE company_id = p_company_id ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.dp_unidades (company_id, nome, cnpj, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, timezone, endereco)
  VALUES (p_company_id, COALESCE(NULLIF(v_c.trade_name,''), v_c.name), v_c.cnpj, v_c.cep, v_c.logradouro, v_c.numero,
          v_c.complemento, v_c.bairro, v_c.cidade, v_c.uf, COALESCE(v_c.phone, v_c.whatsapp), v_c.timezone,
          NULLIF(concat_ws(', ', v_c.logradouro, v_c.numero, v_c.bairro), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dp_criar_unidade_inicial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_criar_unidade_inicial(uuid) TO authenticated, service_role;