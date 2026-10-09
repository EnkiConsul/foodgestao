
-- 1. Origem nas diferenças (app | portal)
ALTER TABLE public.access_shadow_diffs ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'app';
ALTER TABLE public.access_shadow_diffs ADD CONSTRAINT access_shadow_diffs_origem_chk CHECK (origem IN ('app','portal'));
ALTER TABLE public.access_shadow_diffs DROP CONSTRAINT IF EXISTS access_shadow_diffs_company_id_module_dia_key;
ALTER TABLE public.access_shadow_diffs ADD CONSTRAINT access_shadow_diffs_unq UNIQUE (company_id, module, origem, dia);

-- 2. Regra legada única: sem linha = sem vínculo = bloqueado
CREATE OR REPLACE FUNCTION public.get_company_entitlements(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_mode text := public.access_model_mode(); v_fin jsonb; v_pes jsonb; v_leg record;
  v_leg_allowed boolean; v_leg_motivo text; m text; v jsonb;
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL THEN RETURN NULL; END IF;
  v_fin := public.has_module_access(_company_id, 'financeiro');
  v_pes := public.has_module_access(_company_id, 'pessoas');
  IF v_mode = 'sombra' AND public._is_company_member(_company_id, auth.uid()) THEN
    SELECT * INTO v_leg FROM public.company_access_status(_company_id) LIMIT 1;
    v_leg_allowed := (v_leg.company_id IS NOT NULL) AND NOT COALESCE(v_leg.blocked, true);
    v_leg_motivo := CASE WHEN v_leg.company_id IS NULL THEN 'sem_acesso' ELSE v_leg.motivo END;
    FOREACH m IN ARRAY ARRAY['financeiro','pessoas'] LOOP
      v := CASE WHEN m='financeiro' THEN v_fin ELSE v_pes END;
      IF (v->>'allowed')::boolean IS DISTINCT FROM v_leg_allowed THEN
        BEGIN
          INSERT INTO access_shadow_diffs(company_id, module, origem, legacy_allowed, legacy_motivo, v2_allowed, v2_motivo, v2_detalhe)
          VALUES (_company_id, m, 'app', v_leg_allowed, v_leg_motivo, (v->>'allowed')::boolean, v->>'motivo', v)
          ON CONFLICT (company_id, module, origem, dia) DO UPDATE SET ocorrencias = access_shadow_diffs.ocorrencias + 1,
            v2_allowed = EXCLUDED.v2_allowed, v2_motivo = EXCLUDED.v2_motivo, v2_detalhe = EXCLUDED.v2_detalhe,
            legacy_allowed = EXCLUDED.legacy_allowed, legacy_motivo = EXCLUDED.legacy_motivo, updated_at = now();
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('mode', v_mode, 'company_id', _company_id, 'financeiro', v_fin, 'pessoas', v_pes);
END $$;

CREATE OR REPLACE FUNCTION public.access_v2_compare_all()
 RETURNS TABLE(company_id uuid, company_name text, module text, legacy_allowed boolean, legacy_motivo text, v2_allowed boolean, v2_motivo text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c record; v_leg record; v jsonb; m text; v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Somente super admin.';
  END IF;
  FOR c IN SELECT co.id, co.name, co.user_id FROM companies co ORDER BY co.name LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', c.user_id, 'role','authenticated')::text, true);
    v_leg := NULL;
    SELECT * INTO v_leg FROM public.company_access_status(c.id) LIMIT 1;
    PERFORM set_config('request.jwt.claims', COALESCE(v_claims,''), true);
    FOREACH m IN ARRAY ARRAY['financeiro','pessoas'] LOOP
      v := public._module_access_core(c.id, m);
      company_id := c.id; company_name := c.name; module := m;
      legacy_allowed := (v_leg.company_id IS NOT NULL) AND NOT COALESCE(v_leg.blocked, true);
      legacy_motivo := CASE WHEN v_leg.company_id IS NULL THEN 'sem_acesso' ELSE v_leg.motivo END;
      v2_allowed := (v->>'allowed')::boolean; v2_motivo := v->>'motivo';
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;

-- 3. Portal segue o Pessoas
ALTER FUNCTION private.dp_portal_decisao(uuid) RENAME TO dp_portal_decisao_legado;
REVOKE ALL ON FUNCTION private.dp_portal_decisao_legado(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.dp_portal_decisao_legado(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.dp_portal_decisao(_user_id uuid)
 RETURNS TABLE(estado text, colaborador_id uuid, company_id uuid, acesso_ate date)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE r record; v_mode text; v jsonb; v_estado text; v_tenant text;
BEGIN
  SELECT * INTO r FROM private.dp_portal_decisao_legado(_user_id) LIMIT 1;
  IF r.estado NOT IN ('ativo','empresa_suspensa_leitura','sem_plano','sem_modulo') OR r.company_id IS NULL THEN
    RETURN QUERY SELECT r.estado, r.colaborador_id, r.company_id, r.acesso_ate; RETURN;
  END IF;
  v_mode := public.access_model_mode();
  IF v_mode NOT IN ('sombra','v2') THEN
    RETURN QUERY SELECT r.estado, r.colaborador_id, r.company_id, r.acesso_ate; RETURN;
  END IF;
  v := public._module_access_core(r.company_id, 'pessoas');
  SELECT lower(COALESCE(co.status_tenant,'')) INTO v_tenant FROM companies co WHERE co.id = r.company_id;
  IF (v->>'allowed')::boolean THEN
    v_estado := CASE WHEN v_tenant IN ('suspenso','suspended','cancelado','canceled','bloqueado','blocked','expirado','expired','inativo','inactive')
                     THEN 'empresa_suspensa_leitura' ELSE 'ativo' END;
  ELSIF v->>'motivo' = 'expirado_definitivo' THEN v_estado := 'sem_plano';
  ELSE v_estado := 'empresa_suspensa_leitura';
  END IF;
  IF v_mode = 'v2' THEN
    RETURN QUERY SELECT v_estado, r.colaborador_id, r.company_id, r.acesso_ate; RETURN;
  END IF;
  IF v_estado IS DISTINCT FROM r.estado THEN
    BEGIN
      INSERT INTO access_shadow_diffs(company_id, module, origem, legacy_allowed, legacy_motivo, v2_allowed, v2_motivo, v2_detalhe)
      VALUES (r.company_id, 'pessoas', 'portal', r.estado = 'ativo', r.estado, v_estado = 'ativo', COALESCE(v->>'motivo', v_estado),
              v || jsonb_build_object('estado_portal_v2', v_estado))
      ON CONFLICT (company_id, module, origem, dia) DO UPDATE SET ocorrencias = access_shadow_diffs.ocorrencias + 1,
        v2_allowed = EXCLUDED.v2_allowed, v2_motivo = EXCLUDED.v2_motivo, v2_detalhe = EXCLUDED.v2_detalhe,
        legacy_allowed = EXCLUDED.legacy_allowed, legacy_motivo = EXCLUDED.legacy_motivo, updated_at = now();
    EXCEPTION WHEN OTHERS THEN NULL; -- leitura (GET) é somente leitura: nunca quebra o portal
    END;
  END IF;
  RETURN QUERY SELECT r.estado, r.colaborador_id, r.company_id, r.acesso_ate;
END $$;
REVOKE ALL ON FUNCTION private.dp_portal_decisao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.dp_portal_decisao(uuid) TO authenticated, service_role;

-- 4. Opções para empresa sem cobertura
CREATE OR REPLACE FUNCTION public.get_company_coverage_options(_company_id uuid, _module text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_mod text := CASE WHEN _module IN ('dp','pessoas','portal') THEN 'pessoas' ELSE 'financeiro' END;
  v_owner uuid; v_pode boolean; v_sub record; v_uso int; v_chk jsonb; v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  IF NOT public._is_company_member(_company_id, auth.uid()) THEN RAISE EXCEPTION 'Sem vínculo com a empresa.'; END IF;
  SELECT user_id INTO v_owner FROM companies WHERE id = _company_id;
  v_pode := v_owner = auth.uid() OR EXISTS (SELECT 1 FROM company_members m WHERE m.company_id=_company_id
             AND m.user_id=auth.uid() AND m.role IN ('owner','admin'));
  IF NOT v_pode THEN RETURN jsonb_build_object('module', v_mod, 'pode_gerenciar', false); END IF;
  SELECT sub.id, p.name AS plano INTO v_sub FROM subscriptions sub
    JOIN billing_accounts a ON a.id = sub.billing_account_id
    JOIN plans p ON p.id = sub.plan_id
   WHERE a.titular_user_id = v_owner AND COALESCE(sub.module,'financeiro') = v_mod
     AND sub.status::text IN ('active','trialing','grace','past_due','pending')
   ORDER BY sub.created_at DESC LIMIT 1;
  IF v_sub.id IS NULL THEN
    RETURN jsonb_build_object('module', v_mod, 'pode_gerenciar', true, 'assinatura', NULL, 'opcoes', '["conta_separada"]'::jsonb);
  END IF;
  SELECT count(*) INTO v_uso FROM subscription_companies sc WHERE sc.subscription_id = v_sub.id AND sc.removed_at IS NULL;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('role','service_role')::text, true);
  BEGIN
    v_chk := public.plan_rule_check(v_sub.id, 'empresas', v_uso + 1);
  EXCEPTION WHEN OTHERS THEN v_chk := jsonb_build_object('permitido', false, 'opcoes', '["conta_separada"]'::jsonb, 'erro', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', COALESCE(v_claims,''), true);
  RETURN jsonb_build_object('module', v_mod, 'pode_gerenciar', true,
    'assinatura', jsonb_build_object('id', v_sub.id, 'plano', v_sub.plano, 'empresas_cobertas', v_uso)) || v_chk;
END $$;
REVOKE ALL ON FUNCTION public.get_company_coverage_options(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_coverage_options(uuid, text) TO authenticated, service_role;
