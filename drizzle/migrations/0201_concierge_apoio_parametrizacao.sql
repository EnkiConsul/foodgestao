ALTER TABLE public.concierge_provisionamentos
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'convite',
  ADD COLUMN IF NOT EXISTS parametrizacao_concluida_em timestamptz;

-- Lista empresas cadastradas pelo próprio cliente para a Aveto apoiar.
CREATE OR REPLACE FUNCTION public.admin_concierge_buscar_empresa(p_busca text)
RETURNS TABLE (company_id uuid, empresa text, cnpj text, dono_nome text, unidades int, colaboradores int, em_apoio boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_d text := regexp_replace(coalesce(p_busca,''), '\D', '', 'g'); v_t text := trim(coalesce(p_busca,''));
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  IF length(v_t) < 3 THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, coalesce(c.trade_name, c.name), c.cnpj, pr.full_name,
    (SELECT count(*)::int FROM dp_unidades u WHERE u.company_id = c.id),
    (SELECT count(*)::int FROM dp_colaboradores d WHERE d.company_id = c.id),
    EXISTS (SELECT 1 FROM concierge_provisionamentos p WHERE p.company_id = c.id)
  FROM companies c LEFT JOIN profiles pr ON pr.user_id = c.user_id
  WHERE c.profile_type = 'empresarial'
    AND ((length(v_d) >= 4 AND c.cnpj LIKE '%' || v_d || '%') OR c.name ILIKE '%' || v_t || '%' OR c.trade_name ILIKE '%' || v_t || '%')
  ORDER BY c.created_at DESC LIMIT 10;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_buscar_empresa(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_buscar_empresa(text) TO authenticated;

-- Aveto assume a parametrização de empresa já cadastrada pelo cliente (sem mudar o Dono).
CREATE OR REPLACE FUNCTION public.admin_concierge_assumir_empresa(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_c record; v_nome text; v_fone text; v_email text; v_mods text[];
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_c FROM companies WHERE id = p_company_id AND profile_type = 'empresarial';
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado'; END IF;
  IF v_c.user_id = v_uid THEN RAISE EXCEPTION 'empresa_da_aveto'; END IF;
  IF EXISTS (SELECT 1 FROM concierge_provisionamentos WHERE company_id = p_company_id AND modo = 'convite' AND ativado_em IS NULL) THEN
    RAISE EXCEPTION 'aguardando_convite';
  END IF;

  SELECT pr.full_name, regexp_replace(coalesce(pr.phone,''), '\D', '', 'g'), lower(u.email)
    INTO v_nome, v_fone, v_email
    FROM auth.users u LEFT JOIN profiles pr ON pr.user_id = u.id WHERE u.id = v_c.user_id;
  IF v_email LIKE '%@usuarios.aveto360.local' THEN v_email := NULL; END IF;
  SELECT coalesce(array_agg(DISTINCT module::text), ARRAY['dp']) INTO v_mods FROM company_modules
   WHERE company_id = p_company_id AND module::text IN ('dp','financeiro');

  INSERT INTO company_members (company_id, user_id, role, perfil)
  VALUES (p_company_id, v_uid, 'admin', 'personalizado')
  ON CONFLICT DO NOTHING;

  IF 'dp' = ANY(v_mods) AND NOT EXISTS (SELECT 1 FROM dp_unidades WHERE company_id = p_company_id) THEN
    PERFORM dp_criar_unidade_inicial(p_company_id);
  END IF;

  INSERT INTO concierge_provisionamentos (company_id, gestor_nome, gestor_email, gestor_whatsapp, modulos, conta_existente, criado_por, modo, ativado_em, ativado_user_id)
  VALUES (p_company_id, coalesce(nullif(trim(v_nome),''), 'Gestor'), v_email, nullif(v_fone,''), v_mods, true, v_uid, 'apoio', now(), v_c.user_id)
  ON CONFLICT (company_id) DO UPDATE SET modo = 'apoio', criado_por = v_uid, parametrizacao_concluida_em = NULL,
    whatsapp_enviado_em = NULL, email_enviado_em = NULL;
  RETURN jsonb_build_object('company_id', p_company_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_assumir_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_assumir_empresa(uuid) TO authenticated;

-- Conclui: renova 7 dias de teste a partir de hoje e tira a Aveto da empresa.
CREATE OR REPLACE FUNCTION public.admin_concierge_concluir_parametrizacao(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_p record; v_dono uuid; v_dias int := 7; v_raw text; v_fim timestamptz;
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  SELECT * INTO v_p FROM concierge_provisionamentos WHERE company_id = p_company_id AND modo = 'apoio';
  IF NOT FOUND THEN RAISE EXCEPTION 'nao_encontrado'; END IF;
  SELECT user_id INTO v_dono FROM companies WHERE id = p_company_id;
  SELECT regexp_replace(value::text, '\D', '', 'g') INTO v_raw FROM system_parameters WHERE key = 'trial_cadastro_dias';
  IF v_raw ~ '^\d+$' AND v_raw::int BETWEEN 1 AND 90 THEN v_dias := v_raw::int; END IF;
  v_fim := now() + make_interval(days => v_dias);

  IF EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND status_tenant = 'trial') THEN
    UPDATE companies SET trial_iniciado_em = now(), trial_termina_em = v_fim WHERE id = p_company_id;
  END IF;
  UPDATE company_modules SET ends_at = v_fim, trial_termina_em = v_fim
   WHERE company_id = p_company_id AND status = 'trial';
  UPDATE subscriptions s SET trial_ends_at = v_fim, current_period_end = v_fim
   WHERE s.status = 'trialing' AND s.user_id = v_dono
     AND EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.subscription_id = s.id AND sc.company_id = p_company_id AND sc.removed_at IS NULL);
  UPDATE trial_usage t SET ends_at = v_fim
   WHERE t.subscription_id IN (SELECT s.id FROM subscriptions s WHERE s.status = 'trialing' AND s.user_id = v_dono
     AND EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.subscription_id = s.id AND sc.company_id = p_company_id AND sc.removed_at IS NULL));

  DELETE FROM company_members WHERE company_id = p_company_id AND user_id = v_p.criado_por AND user_id <> v_dono;
  UPDATE concierge_provisionamentos SET parametrizacao_concluida_em = now() WHERE company_id = p_company_id;
  RETURN jsonb_build_object('trial_termina_em', v_fim);
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_concluir_parametrizacao(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_concierge_lista();
CREATE FUNCTION public.admin_concierge_lista()
RETURNS TABLE (company_id uuid, empresa text, cnpj text, gestor_nome text, gestor_email text, gestor_whatsapp text,
  modulos text[], conta_existente boolean, criado_em timestamptz, whatsapp_enviado_em timestamptz, email_enviado_em timestamptz,
  link_aberto_em timestamptz, ativado_em timestamptz, convite_status text, convite_expira_em timestamptz, token text,
  unidades int, colaboradores int, fichas int, modo text, parametrizacao_concluida_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'sem_permissao'; END IF;
  RETURN QUERY
  SELECT p.company_id, coalesce(c.trade_name, c.name), c.cnpj, p.gestor_nome, p.gestor_email, p.gestor_whatsapp,
    p.modulos, p.conta_existente, p.criado_em, p.whatsapp_enviado_em, p.email_enviado_em, p.link_aberto_em, p.ativado_em,
    i.status::text, i.expires_at, CASE WHEN i.status = 'pending' THEN i.token END,
    (SELECT count(*)::int FROM dp_unidades u WHERE u.company_id = p.company_id),
    (SELECT count(*)::int FROM dp_colaboradores d WHERE d.company_id = p.company_id),
    (SELECT count(*)::int FROM dp_ficha_importacoes f WHERE f.company_id = p.company_id),
    p.modo, p.parametrizacao_concluida_em
  FROM concierge_provisionamentos p
  JOIN companies c ON c.id = p.company_id
  LEFT JOIN company_invites i ON i.id = p.invite_id
  ORDER BY p.criado_em DESC;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_concierge_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_concierge_lista() TO authenticated;