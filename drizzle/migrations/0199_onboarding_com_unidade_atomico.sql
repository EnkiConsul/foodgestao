CREATE OR REPLACE FUNCTION public.fn_cadastrar_empresa_onboarding_com_unidade(
  p_nome_completo text, p_email_cliente text, p_telefone_cliente text, p_whatsapp_cliente text,
  p_cnpj text, p_razao_social text, p_nome_fantasia text, p_segmento_id uuid, p_cep text,
  p_logradouro text, p_numero text, p_complemento text, p_bairro text, p_cidade text, p_uf text,
  p_telefone_empresa text, p_whatsapp_empresa text, p_email_empresa text, p_modulos_slugs text[],
  p_criar_unidade boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.fn_cadastrar_empresa_onboarding(p_nome_completo, p_email_cliente, p_telefone_cliente,
    p_whatsapp_cliente, p_cnpj, p_razao_social, p_nome_fantasia, p_segmento_id, p_cep, p_logradouro,
    p_numero, p_complemento, p_bairro, p_cidade, p_uf, p_telefone_empresa, p_whatsapp_empresa,
    p_email_empresa, p_modulos_slugs);
  IF p_criar_unidade AND 'dp' = ANY(p_modulos_slugs) AND (v_res->>'company_id') IS NOT NULL THEN
    PERFORM public.dp_criar_unidade_inicial((v_res->>'company_id')::uuid);
  END IF;
  RETURN v_res;
END $$;
REVOKE ALL ON FUNCTION public.fn_cadastrar_empresa_onboarding_com_unidade(text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding_com_unidade(text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[],boolean) TO authenticated;