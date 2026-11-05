CREATE TABLE public.concierge_provisionamentos (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  invite_id uuid,
  invite_grupo_id uuid,
  gestor_nome text NOT NULL,
  gestor_email text,
  gestor_whatsapp text,
  modulos text[] NOT NULL,
  conta_existente boolean NOT NULL DEFAULT false,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  whatsapp_enviado_em timestamptz,
  email_enviado_em timestamptz,
  link_aberto_em timestamptz,
  ativado_em timestamptz,
  ativado_user_id uuid
);
GRANT SELECT ON public.concierge_provisionamentos TO authenticated;
GRANT ALL ON public.concierge_provisionamentos TO service_role;
ALTER TABLE public.concierge_provisionamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê provisionamentos" ON public.concierge_provisionamentos
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- Cria empresa + loja + convite de Dono, com o super admin como titular provisório.
CREATE OR REPLACE FUNCTION public.admin_provisionar_empresa_concierge(
  p_cnpj text, p_razao_social text, p_nome_fantasia text,
  p_cep text, p_logradouro text, p_numero text, p_complemento text, p_bairro text, p_cidade text, p_uf text,
  p_telefone_empresa text, p_email_empresa text,
  p_gestor_nome text, p_gestor_email text, p_gestor_whatsapp text,
  p_modulos text[], p_criar_unidade boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cnpj text := regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g');
  v_wa text := regexp_replace(coalesce(p_gestor_whatsapp,''), '\D', '', 'g');
  v_email text := lower(nullif(trim(coalesce(p_gestor_email,'')), ''));
  v_company uuid; v_slug text; v_inv record; v_existe boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF length(v_cnpj) <> 14 THEN RAISE EXCEPTION 'cnpj_invalido'; END IF;
  IF coalesce(trim(p_razao_social),'') = '' THEN RAISE EXCEPTION 'razao_social_obrigatoria'; END IF;
  IF coalesce(trim(p_gestor_nome),'') = '' THEN RAISE EXCEPTION 'gestor_nome_obrigatorio'; END IF;
  IF v_email IS NULL AND length(v_wa) < 10 THEN RAISE EXCEPTION 'gestor_contato_obrigatorio'; END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'email_invalido'; END IF;
  IF p_modulos IS NULL OR array_length(p_modulos,1) IS NULL THEN RAISE EXCEPTION 'nenhum_modulo_selecionado'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_modulos) m WHERE m NOT IN ('dp','financeiro')) THEN RAISE EXCEPTION 'modulo_invalido'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE cnpj = v_cnpj AND profile_type = 'empresarial') THEN
    RAISE EXCEPTION 'empresa_ja_cadastrada';
  END IF;

  INSERT INTO companies (user_id, profile_type, name, trade_name, cnpj, email, phone, whatsapp,
    cep, logradouro, numero, complemento, bairro, cidade, uf, is_active, status_tenant, trial_iniciado_em, trial_termina_em)
  VALUES (v_uid, 'empresarial', p_razao_social, nullif(p_nome_fantasia,''), v_cnpj, nullif(p_email_empresa,''),
    nullif(p_telefone_empresa,''), nullif(v_wa,''), p_cep, p_logradouro, p_numero, p_complemento, p_bairro, p_cidade,
    upper(p_uf), true, 'trial', now(), now() + interval '7 days')
  RETURNING id INTO v_company;

  FOREACH v_slug IN ARRAY p_modulos LOOP
    INSERT INTO company_modules (company_id, module, status, starts_at, ends_at, trial_iniciado_em, trial_termina_em)
    VALUES (v_company, v_slug::app_module, 'trial'::module_status, now(), now() + interval '7 days', now(), now() + interval '7 days')
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF p_criar_unidade AND 'dp' = ANY(p_modulos) THEN
    PERFORM dp_criar_unidade_inicial(v_company);
  END IF;

  INSERT INTO company_invites (company_id, invited_email, role, invited_by, full_name, whatsapp, perfil, modulos, expires_at)
  VALUES (v_company, v_email, 'owner', v_uid, trim(p_gestor_nome), nullif(v_wa,''), 'dono',
    jsonb_build_object('conta', true, 'pessoas', 'dp' = ANY(p_modulos), 'financeiro', 'financeiro' = ANY(p_modulos)),
    now() + interval '15 days')
  RETURNING id, grupo_id, token INTO v_inv;

  v_existe := EXISTS (SELECT 1 FROM auth.users u WHERE (v_email IS NOT NULL AND lower(u.email) = v_email)
                 OR (length(v_wa) >= 10 AND lower(u.email) = 'wa' || v_wa || '@usuarios.aveto360.local'));

  INSERT INTO concierge_provisionamentos (company_id, invite_id, invite_grupo_id, gestor_nome, gestor_email, gestor_whatsapp, modulos, conta_existente, criado_por)
  VALUES (v_company, v_inv.id, v_inv.grupo_id, trim(p_gestor_nome), v_email, nullif(v_wa,''), p_modulos, v_existe, v_uid);

  RETURN jsonb_build_object('company_id', v_company, 'invite_id', v_inv.id, 'token', v_inv.token, 'conta_existente', v_existe);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_provisionar_empresa_concierge(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_provisionar_empresa_concierge(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text[],boolean) TO authenticated;

-- Lista para o painel da Aveto
CREATE OR REPLACE FUNCTION public.admin_concierge_lista()
RETURNS TABLE (company_id uuid, empresa text, cnpj text, gestor_nome text, gestor_email text, gestor_whatsapp text,
  modulos text[], conta_existente boolean, criado_em timestamptz, whatsapp_enviado_em timestamptz, email_enviado_em timestamptz,
  link_aberto_em timestamptz, ativado_em timestamptz, convite_status text, convite_expira_em timestamptz, token text,
  unidades int, colaboradores int, fichas int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  RETURN QUERY
  SELECT p.company_id, coalesce(c.trade_name, c.name), c.cnpj, p.gestor_nome, p.gestor_email, p.gestor_whatsapp,
    p.modulos, p.conta_existente, p.criado_em, p.whatsapp_enviado_em, p.email_enviado_em, p.link_aberto_em, p.ativado_em,
    i.status::text, i.expires_at, CASE WHEN i.status = 'pending' THEN i.token END,
    (SELECT count(*)::int FROM dp_unidades u WHERE u.company_id = p.company_id),
    (SELECT count(*)::int FROM dp_colaboradores d WHERE d.company_id = p.company_id),
    (SELECT count(*)::int FROM dp_ficha_importacoes f WHERE f.company_id = p.company_id)
  FROM concierge_provisionamentos p
  JOIN companies c ON c.id = p.company_id
  LEFT JOIN company_invites i ON i.id = p.invite_id
  ORDER BY p.criado_em DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_lista() TO authenticated;

-- Novo convite (link expirado ou perdido)
CREATE OR REPLACE FUNCTION public.admin_concierge_renovar_convite(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_inv record;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_p FROM concierge_provisionamentos WHERE company_id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado'; END IF;
  IF v_p.ativado_em IS NOT NULL THEN RAISE EXCEPTION 'ja_ativado'; END IF;
  UPDATE company_invites SET status = 'expired' WHERE id = v_p.invite_id AND status = 'pending';
  INSERT INTO company_invites (company_id, invited_email, role, invited_by, full_name, whatsapp, perfil, modulos, expires_at)
  SELECT company_id, invited_email, role, auth.uid(), full_name, whatsapp, perfil, modulos, now() + interval '15 days'
    FROM company_invites WHERE id = v_p.invite_id
  RETURNING id, grupo_id, token INTO v_inv;
  UPDATE concierge_provisionamentos SET invite_id = v_inv.id, invite_grupo_id = v_inv.grupo_id,
    whatsapp_enviado_em = NULL, email_enviado_em = NULL, link_aberto_em = NULL WHERE company_id = p_company_id;
  RETURN jsonb_build_object('invite_id', v_inv.id, 'token', v_inv.token);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_renovar_convite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_renovar_convite(uuid) TO authenticated;

-- Ativação: chamada só pelo servidor quando o gestor cria a senha ou aceita o convite.
-- Transfere a titularidade, tira a Aveto da empresa e começa os 7 dias de teste agora.
CREATE OR REPLACE FUNCTION public.concierge_ativar(p_grupo_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_p record; v_dias int := 7; v_raw text; v_fim timestamptz; v_mod text; v_quer text[]; v_sub uuid; v_plan uuid; v_acc uuid;
BEGIN
  SELECT regexp_replace(value::text, '\D', '', 'g') INTO v_raw FROM system_parameters WHERE key = 'trial_cadastro_dias';
  IF v_raw ~ '^\d+$' AND v_raw::int BETWEEN 1 AND 90 THEN v_dias := v_raw::int; END IF;
  v_fim := now() + make_interval(days => v_dias);

  FOR v_p IN SELECT * FROM concierge_provisionamentos WHERE invite_grupo_id = p_grupo_id AND ativado_em IS NULL LOOP
    UPDATE companies SET user_id = p_user_id, trial_iniciado_em = now(), trial_termina_em = v_fim WHERE id = v_p.company_id;
    UPDATE company_modules SET starts_at = now(), ends_at = v_fim, trial_iniciado_em = now(), trial_termina_em = v_fim
     WHERE company_id = v_p.company_id AND status = 'trial';
    DELETE FROM company_members WHERE company_id = v_p.company_id AND user_id = v_p.criado_por AND user_id <> p_user_id;
    UPDATE company_members SET role = 'owner', perfil = 'dono' WHERE company_id = v_p.company_id AND user_id = p_user_id;
    UPDATE profiles SET onboarding_completed = true, profile_type = 'empresarial' WHERE user_id = p_user_id;

    v_quer := ARRAY[]::text[];
    IF 'dp' = ANY(v_p.modulos) THEN v_quer := v_quer || 'pessoas'; END IF;
    IF 'financeiro' = ANY(v_p.modulos) THEN v_quer := v_quer || 'financeiro'; END IF;
    FOREACH v_mod IN ARRAY v_quer LOOP
      v_sub := NULL;
      SELECT id INTO v_sub FROM subscriptions WHERE user_id = p_user_id AND module = v_mod AND status IN ('trialing','active')
        ORDER BY created_at DESC LIMIT 1;
      IF v_sub IS NULL THEN
        SELECT id INTO v_plan FROM plans WHERE slug = v_mod || '-gestao' AND is_active LIMIT 1;
        IF v_plan IS NOT NULL THEN
          BEGIN
            v_acc := billing_v2_user_empty_account(p_user_id, true);
            INSERT INTO subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
            VALUES (p_user_id, v_plan, v_mod, 'trialing', v_fim, v_fim, v_acc) RETURNING id INTO v_sub;
            INSERT INTO trial_usage (titular_user_id, email, module, plan_id, subscription_id, origem, started_at, ends_at)
            SELECT p_user_id, lower(u.email), v_mod, v_plan, v_sub, 'concierge', now(), v_fim FROM auth.users u WHERE u.id = p_user_id;
          EXCEPTION WHEN unique_violation THEN NULL;
          END;
        END IF;
      END IF;
      IF v_sub IS NOT NULL AND NOT EXISTS (SELECT 1 FROM subscription_companies WHERE company_id = v_p.company_id AND module = v_mod AND removed_at IS NULL) THEN
        INSERT INTO subscription_companies (subscription_id, company_id, module) VALUES (v_sub, v_p.company_id, v_mod);
      END IF;
    END LOOP;

    UPDATE concierge_provisionamentos SET ativado_em = now(), ativado_user_id = p_user_id WHERE company_id = v_p.company_id;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.concierge_ativar(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.concierge_ativar(uuid, uuid) TO service_role;