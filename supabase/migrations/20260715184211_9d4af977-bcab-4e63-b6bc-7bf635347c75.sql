CREATE OR REPLACE FUNCTION public.fn_cadastrar_empresa_onboarding(
  p_nome_completo    text,
  p_email_cliente    text,
  p_telefone_cliente text,
  p_whatsapp_cliente text,
  p_cnpj             text,
  p_razao_social     text,
  p_nome_fantasia    text,
  p_segmento_id      uuid,
  p_cep              text,
  p_logradouro       text,
  p_numero           text,
  p_complemento      text,
  p_bairro           text,
  p_cidade           text,
  p_uf               text,
  p_telefone_empresa text,
  p_whatsapp_empresa text,
  p_email_empresa    text,
  p_modulos_slugs    text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_trial_fim timestamptz := now() + interval '14 days';
  v_slug text;
  v_cnpj_digits text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'usuario_nao_autenticado';
  END IF;

  IF p_modulos_slugs IS NULL OR array_length(p_modulos_slugs, 1) IS NULL OR array_length(p_modulos_slugs, 1) = 0 THEN
    RAISE EXCEPTION 'nenhum_modulo_selecionado';
  END IF;

  IF length(v_cnpj_digits) <> 14 THEN
    RAISE EXCEPTION 'cnpj_invalido';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.companies
    WHERE cnpj = v_cnpj_digits AND profile_type = 'empresarial'
  ) THEN
    RAISE EXCEPTION 'empresa_ja_cadastrada';
  END IF;

  UPDATE public.profiles
     SET full_name = COALESCE(NULLIF(p_nome_completo,''), full_name),
         phone = COALESCE(NULLIF(p_telefone_cliente,''), phone),
         updated_at = now()
   WHERE user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, full_name, phone, profile_type)
    VALUES (v_uid, p_nome_completo, p_telefone_cliente, 'empresarial');
  END IF;

  INSERT INTO public.companies (
    user_id, profile_type, name, trade_name, cnpj, email, phone, whatsapp,
    segmento_id, cep, logradouro, numero, complemento, bairro, cidade, uf,
    is_active, status_tenant, trial_iniciado_em, trial_termina_em
  ) VALUES (
    v_uid, 'empresarial', p_razao_social, p_nome_fantasia, v_cnpj_digits,
    p_email_empresa, p_telefone_empresa, p_whatsapp_empresa,
    p_segmento_id, p_cep, p_logradouro, p_numero, p_complemento, p_bairro, p_cidade, upper(p_uf),
    true, 'trial', now(), v_trial_fim
  )
  RETURNING id INTO v_company_id;

  -- O vínculo do usuário como owner é criado pelo trigger trigger_auto_add_company_owner.
  -- Não inserir aqui para evitar duplicidade em company_members.

  FOREACH v_slug IN ARRAY p_modulos_slugs LOOP
    INSERT INTO public.company_modules (
      company_id, module, status, starts_at, ends_at,
      trial_iniciado_em, trial_termina_em
    ) VALUES (
      v_company_id, v_slug::public.app_module, 'trial'::public.module_status,
      now(), v_trial_fim, now(), v_trial_fim
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'trial_termina_em', v_trial_fim
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding(
  text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[]
) TO authenticated;