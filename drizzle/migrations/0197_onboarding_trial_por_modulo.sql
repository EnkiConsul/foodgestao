CREATE OR REPLACE FUNCTION public.fn_onboarding_sincronizar_trial(p_uid uuid, p_company_id uuid, p_modulos text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_quer text[] := ARRAY[]::text[];
  v_mod text; v_sub record; v_plan uuid; v_new uuid; v_fim timestamptz;
BEGIN
  IF 'dp' = ANY(p_modulos) OR 'pessoas' = ANY(p_modulos) THEN v_quer := v_quer || 'pessoas'; END IF;
  IF 'financeiro' = ANY(p_modulos) THEN v_quer := v_quer || 'financeiro'; END IF;
  IF array_length(v_quer,1) IS NULL THEN RETURN; END IF;

  -- Trial criado no cadastro para módulo não escolhido: converte em vez de queimar
  SELECT * INTO v_sub FROM subscriptions s
   WHERE s.user_id = p_uid AND s.status = 'trialing' AND NOT (s.module = ANY(v_quer))
     AND NOT EXISTS (SELECT 1 FROM subscriptions o WHERE o.user_id = p_uid AND o.status IN ('trialing','active') AND o.module = ANY(v_quer))
   ORDER BY s.created_at DESC LIMIT 1;
  IF FOUND THEN
    v_mod := v_quer[1];
    SELECT id INTO v_plan FROM plans WHERE slug = v_mod || '-gestao' AND is_active LIMIT 1;
    IF v_plan IS NOT NULL THEN
      UPDATE subscription_companies SET removed_at = now() WHERE subscription_id = v_sub.id AND removed_at IS NULL;
      UPDATE subscriptions SET module = v_mod, plan_id = v_plan, updated_at = now() WHERE id = v_sub.id;
      UPDATE trial_usage SET module = v_mod, plan_id = v_plan WHERE subscription_id = v_sub.id;
    END IF;
  END IF;

  SELECT max(trial_ends_at) INTO v_fim FROM subscriptions WHERE user_id = p_uid AND status = 'trialing';

  FOREACH v_mod IN ARRAY v_quer LOOP
    SELECT id INTO v_new FROM subscriptions WHERE user_id = p_uid AND module = v_mod AND status IN ('trialing','active')
      ORDER BY created_at DESC LIMIT 1;
    IF v_new IS NULL AND v_fim IS NOT NULL THEN
      SELECT id INTO v_plan FROM plans WHERE slug = v_mod || '-gestao' AND is_active LIMIT 1;
      IF v_plan IS NOT NULL THEN
        INSERT INTO subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
        SELECT p_uid, v_plan, v_mod, 'trialing', v_fim, v_fim, billing_account_id
          FROM subscriptions WHERE user_id = p_uid AND status = 'trialing' ORDER BY created_at LIMIT 1
        RETURNING id INTO v_new;
        INSERT INTO trial_usage(titular_user_id, email, module, plan_id, subscription_id, origem, started_at, ends_at)
        SELECT p_uid, lower(u.email), v_mod, v_plan, v_new, 'onboarding', now(), v_fim FROM auth.users u WHERE u.id = p_uid;
      END IF;
    END IF;
    IF v_new IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subscription_companies WHERE company_id = p_company_id AND module = v_mod AND removed_at IS NULL) THEN
      INSERT INTO subscription_companies (subscription_id, company_id, module) VALUES (v_new, p_company_id, v_mod);
    END IF;
    v_new := NULL;
  END LOOP;
END $f$;
REVOKE ALL ON FUNCTION public.fn_onboarding_sincronizar_trial(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_onboarding_sincronizar_trial(uuid, uuid, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_cadastrar_empresa_onboarding(p_nome_completo text, p_email_cliente text, p_telefone_cliente text, p_whatsapp_cliente text, p_cnpj text, p_razao_social text, p_nome_fantasia text, p_segmento_id uuid, p_cep text, p_logradouro text, p_numero text, p_complemento text, p_bairro text, p_cidade text, p_uf text, p_telefone_empresa text, p_whatsapp_empresa text, p_email_empresa text, p_modulos_slugs text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_dias int := 7;
  v_trial_fim timestamptz;
  v_slug text;
  v_cnpj_digits text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
  v_raw text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'usuario_nao_autenticado'; END IF;
  SELECT regexp_replace(value::text, '\D', '', 'g') INTO v_raw FROM public.system_parameters WHERE key = 'trial_cadastro_dias';
  IF v_raw ~ '^\d+$' AND v_raw::int BETWEEN 1 AND 90 THEN v_dias := v_raw::int; END IF;
  v_trial_fim := now() + make_interval(days => v_dias);
  IF p_modulos_slugs IS NULL OR array_length(p_modulos_slugs, 1) IS NULL OR array_length(p_modulos_slugs, 1) = 0 THEN
    RAISE EXCEPTION 'nenhum_modulo_selecionado';
  END IF;
  IF length(v_cnpj_digits) <> 14 THEN RAISE EXCEPTION 'cnpj_invalido'; END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE cnpj = v_cnpj_digits AND profile_type = 'empresarial') THEN
    RAISE EXCEPTION 'empresa_ja_cadastrada';
  END IF;
  UPDATE public.profiles SET full_name = COALESCE(NULLIF(p_nome_completo,''), full_name),
         phone = COALESCE(NULLIF(p_telefone_cliente,''), phone), updated_at = now()
   WHERE user_id = v_uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (user_id, full_name, phone, profile_type) VALUES (v_uid, p_nome_completo, p_telefone_cliente, 'empresarial');
  END IF;
  INSERT INTO public.companies (user_id, profile_type, name, trade_name, cnpj, email, phone, whatsapp,
    segmento_id, cep, logradouro, numero, complemento, bairro, cidade, uf, is_active, status_tenant, trial_iniciado_em, trial_termina_em
  ) VALUES (v_uid, 'empresarial', p_razao_social, p_nome_fantasia, v_cnpj_digits, p_email_empresa, p_telefone_empresa, p_whatsapp_empresa,
    p_segmento_id, p_cep, p_logradouro, p_numero, p_complemento, p_bairro, p_cidade, upper(p_uf), true, 'trial', now(), v_trial_fim)
  RETURNING id INTO v_company_id;
  FOREACH v_slug IN ARRAY p_modulos_slugs LOOP
    INSERT INTO public.company_modules (company_id, module, status, starts_at, ends_at, trial_iniciado_em, trial_termina_em)
    VALUES (v_company_id, v_slug::public.app_module, 'trial'::public.module_status, now(), v_trial_fim, now(), v_trial_fim)
    ON CONFLICT DO NOTHING;
  END LOOP;
  PERFORM public.fn_onboarding_sincronizar_trial(v_uid, v_company_id, p_modulos_slugs);
  RETURN jsonb_build_object('company_id', v_company_id, 'trial_termina_em', v_trial_fim);
END;
$function$;