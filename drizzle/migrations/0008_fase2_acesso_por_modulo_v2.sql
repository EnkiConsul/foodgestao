
-- 0. Cadastro nunca falha por causa da cobrança
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _plan_id uuid; _dias integer; _acc uuid; _mod text; _doc text; _sub uuid;
BEGIN
  BEGIN
    IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local' THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM public.company_invites i
               WHERE lower(i.invited_email) = lower(NEW.email) AND i.status::text = 'pending') THEN
      RETURN NEW;
    END IF;
    _mod := CASE WHEN NEW.raw_user_meta_data->>'trial_module' = 'pessoas' THEN 'pessoas' ELSE 'financeiro' END;
    _doc := public.billing_v2_digits(COALESCE(NEW.raw_user_meta_data->>'cpf', NEW.raw_user_meta_data->>'document'));
    IF EXISTS (SELECT 1 FROM trial_usage t WHERE lower(t.email) = lower(NEW.email)
                 OR (_doc IS NOT NULL AND t.documento_titular = _doc)) THEN
      RETURN NEW;
    END IF;
    SELECT id INTO _plan_id FROM public.plans WHERE slug = _mod || '-gestao' AND is_active LIMIT 1;
    IF _plan_id IS NULL THEN RETURN NEW; END IF;
    SELECT COALESCE((value #>> '{}')::int, 7) INTO _dias FROM system_parameters WHERE key = 'trial_cadastro_dias';
    _dias := COALESCE(_dias, 7);
    IF _dias <= 0 THEN RETURN NEW; END IF;
    BEGIN
      _acc := public.billing_v2_user_empty_account(NEW.id, true);
      INSERT INTO public.subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
      VALUES (NEW.id, _plan_id, _mod, 'trialing', now() + make_interval(days => _dias), now() + make_interval(days => _dias), _acc)
      RETURNING id INTO _sub;
      INSERT INTO trial_usage(titular_user_id, email, documento_titular, module, plan_id, subscription_id, started_at, ends_at)
      VALUES (NEW.id, lower(NEW.email), _doc, _mod, _plan_id, _sub, now(), now() + make_interval(days => _dias));
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_subscription: cobrança não criada para %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  END;
  RETURN NEW;
END $function$;

-- 1. Núcleo de decisão v2 (sem checagem de vínculo; uso interno)
CREATE OR REPLACE FUNCTION public._module_access_core(_company_id uuid, _module text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_mod text := CASE WHEN _module IN ('dp','pessoas','portal') THEN 'pessoas' ELSE _module END;
  s record; f record; v_atraso int; v_motivo text; v_best jsonb := NULL; v_cur jsonb; v_grant record; v_found boolean := false;
BEGIN
  FOR s IN
    SELECT sub.* FROM subscriptions sub
    JOIN subscription_companies sc ON sc.subscription_id = sub.id AND sc.company_id = _company_id
      AND sc.removed_at IS NULL AND COALESCE(sc.module, sub.module) = v_mod
    WHERE COALESCE(sub.module,'financeiro') = v_mod AND sub.status::text NOT IN ('canceled','expired')
    ORDER BY sub.created_at DESC
  LOOP
    v_found := true; v_atraso := NULL; v_motivo := NULL; f := NULL;
    SELECT i.id, i.due_date INTO f FROM invoices i
     WHERE i.subscription_id = s.id AND i.status IN ('open','overdue') AND i.due_date < current_date
     ORDER BY i.due_date LIMIT 1;
    IF f.id IS NOT NULL THEN v_atraso := (current_date - f.due_date)::int; END IF;

    SELECT g.* INTO v_grant FROM subscription_grants g
     WHERE g.subscription_id = s.id AND g.revoked_at IS NULL
       AND g.tipo IN ('cortesia_total','carencia')
       AND (g.starts_at IS NULL OR g.starts_at <= now())
       AND ((g.tipo = 'cortesia_total' AND (g.ends_at IS NULL OR g.ends_at > now()))
         OR (g.tipo = 'carencia' AND g.ends_at > now()))
     ORDER BY (g.tipo = 'cortesia_total') DESC LIMIT 1;

    IF v_grant.id IS NOT NULL THEN v_motivo := NULL;
    ELSIF s.status::text = 'trialing' THEN
      IF s.trial_ends_at IS NULL OR s.trial_ends_at < now() THEN v_motivo := 'trial_expirado'; END IF;
    ELSIF s.status::text = 'grace' THEN
      IF s.grace_ends_at IS NULL OR s.grace_ends_at < now() THEN v_motivo := 'carencia_expirada'; END IF;
    ELSIF s.status::text IN ('active','past_due','pending') THEN
      IF v_atraso IS NULL OR v_atraso <= 10 THEN v_motivo := NULL;
      ELSIF v_atraso <= 30 THEN v_motivo := 'inadimplente_suspenso';
      ELSIF v_atraso <= 90 THEN v_motivo := 'rescindido';
      ELSE v_motivo := 'expirado_definitivo'; END IF;
    ELSE v_motivo := 'sem_assinatura';
    END IF;

    v_cur := jsonb_build_object('module', v_mod, 'allowed', v_motivo IS NULL, 'status', s.status::text,
      'motivo', v_motivo, 'subscription_id', s.id,
      'grant', CASE WHEN v_grant.id IS NOT NULL THEN v_grant.tipo::text END,
      'dias_restantes', CASE
          WHEN v_grant.id IS NOT NULL AND v_grant.ends_at IS NOT NULL THEN GREATEST(0, ceil(EXTRACT(EPOCH FROM v_grant.ends_at - now())/86400))::int
          WHEN s.status::text = 'trialing' AND s.trial_ends_at IS NOT NULL THEN GREATEST(0, ceil(EXTRACT(EPOCH FROM s.trial_ends_at - now())/86400))::int
          WHEN s.status::text = 'grace' AND s.grace_ends_at IS NOT NULL THEN GREATEST(0, ceil(EXTRACT(EPOCH FROM s.grace_ends_at - now())/86400))::int END,
      'trial_ends_at', s.trial_ends_at,
      'grace_ends_at', CASE WHEN v_grant.tipo = 'carencia' THEN v_grant.ends_at WHEN s.status::text='grace' THEN s.grace_ends_at END,
      'dias_atraso', v_atraso, 'fatura_pendente_id', f.id,
      'can_export', COALESCE(v_motivo,'') <> 'expirado_definitivo');
    IF v_motivo IS NULL THEN RETURN v_cur; END IF;
    IF v_best IS NULL THEN v_best := v_cur; END IF;
  END LOOP;
  IF NOT v_found THEN
    RETURN jsonb_build_object('module', v_mod, 'allowed', false, 'status', NULL, 'motivo', 'sem_cobertura',
      'dias_restantes', NULL, 'trial_ends_at', NULL, 'grace_ends_at', NULL, 'dias_atraso', NULL,
      'fatura_pendente_id', NULL, 'can_export', true);
  END IF;
  RETURN v_best;
END $$;
REVOKE ALL ON FUNCTION public._module_access_core(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._module_access_core(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public._is_company_member(_company_id uuid, _uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT _uid IS NOT NULL AND (EXISTS (SELECT 1 FROM companies c WHERE c.id=_company_id AND c.user_id=_uid)
   OR EXISTS (SELECT 1 FROM company_members m WHERE m.company_id=_company_id AND m.user_id=_uid)) $$;
REVOKE ALL ON FUNCTION public._is_company_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._is_company_member(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_module_access(_company_id uuid, _module text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public._is_company_member(_company_id, auth.uid()) THEN
    -- colaborador do portal: herda o Pessoas da empresa onde está vinculado
    IF NOT (_module IN ('dp','pessoas','portal') AND EXISTS (
      SELECT 1 FROM dp_colaboradores c WHERE c.company_id=_company_id AND c.user_id = auth.uid())) THEN
      RETURN jsonb_build_object('module', _module, 'allowed', false, 'motivo', 'sem_vinculo');
    END IF;
  END IF;
  RETURN public._module_access_core(_company_id, _module);
END $$;
REVOKE ALL ON FUNCTION public.has_module_access(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, text) TO authenticated, service_role;

-- Flag access_model_v2
INSERT INTO public.system_parameters(key, value, description)
VALUES ('access_model_v2', '"legado"'::jsonb, 'Modelo de acesso: legado | sombra | v2')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.access_model_mode()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT value #>> '{}' FROM system_parameters WHERE key='access_model_v2'),'legado') $$;
GRANT EXECUTE ON FUNCTION public.access_model_mode() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.access_model_set_mode(_mode text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Somente super admin pode alterar o modelo de acesso.'; END IF;
  IF _mode NOT IN ('legado','sombra','v2') THEN RAISE EXCEPTION 'Modo inválido.'; END IF;
  UPDATE system_parameters SET value = to_jsonb(_mode), updated_by = auth.uid(), updated_at = now() WHERE key='access_model_v2';
  RETURN _mode;
END $$;
REVOKE ALL ON FUNCTION public.access_model_set_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_model_set_mode(text) TO authenticated, service_role;

-- Diferenças silenciosas
CREATE TABLE public.access_shadow_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  module text NOT NULL,
  dia date NOT NULL DEFAULT current_date,
  legacy_allowed boolean NOT NULL,
  legacy_motivo text,
  v2_allowed boolean NOT NULL,
  v2_motivo text,
  v2_detalhe jsonb,
  ocorrencias integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, module, dia)
);
GRANT SELECT ON public.access_shadow_diffs TO authenticated;
GRANT ALL ON public.access_shadow_diffs TO service_role;
ALTER TABLE public.access_shadow_diffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê diferenças" ON public.access_shadow_diffs FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_company_entitlements(_company_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_mode text := public.access_model_mode(); v_fin jsonb; v_pes jsonb; v_leg record; v_leg_allowed boolean; m text; v jsonb;
BEGIN
  IF auth.uid() IS NULL OR _company_id IS NULL THEN RETURN NULL; END IF;
  v_fin := public.has_module_access(_company_id, 'financeiro');
  v_pes := public.has_module_access(_company_id, 'pessoas');
  IF v_mode = 'sombra' AND public._is_company_member(_company_id, auth.uid()) THEN
    SELECT * INTO v_leg FROM public.company_access_status(_company_id) LIMIT 1;
    v_leg_allowed := NOT COALESCE(v_leg.blocked, false);
    FOREACH m IN ARRAY ARRAY['financeiro','pessoas'] LOOP
      v := CASE WHEN m='financeiro' THEN v_fin ELSE v_pes END;
      IF (v->>'allowed')::boolean IS DISTINCT FROM v_leg_allowed THEN
        INSERT INTO access_shadow_diffs(company_id, module, legacy_allowed, legacy_motivo, v2_allowed, v2_motivo, v2_detalhe)
        VALUES (_company_id, m, v_leg_allowed, v_leg.motivo, (v->>'allowed')::boolean, v->>'motivo', v)
        ON CONFLICT (company_id, module, dia) DO UPDATE SET ocorrencias = access_shadow_diffs.ocorrencias + 1,
          v2_allowed = EXCLUDED.v2_allowed, v2_motivo = EXCLUDED.v2_motivo, v2_detalhe = EXCLUDED.v2_detalhe,
          legacy_allowed = EXCLUDED.legacy_allowed, legacy_motivo = EXCLUDED.legacy_motivo, updated_at = now();
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('mode', v_mode, 'company_id', _company_id, 'financeiro', v_fin, 'pessoas', v_pes);
END $$;
REVOKE ALL ON FUNCTION public.get_company_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_entitlements(uuid) TO authenticated, service_role;

-- Comparação completa (super admin), sem aplicar
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
    SELECT * INTO v_leg FROM public.company_access_status(c.id) LIMIT 1;
    PERFORM set_config('request.jwt.claims', COALESCE(v_claims,''), true);
    FOREACH m IN ARRAY ARRAY['financeiro','pessoas'] LOOP
      v := public._module_access_core(c.id, m);
      company_id := c.id; company_name := c.name; module := m;
      legacy_allowed := NOT COALESCE(v_leg.blocked, true); legacy_motivo := v_leg.motivo;
      v2_allowed := (v->>'allowed')::boolean; v2_motivo := v->>'motivo';
      RETURN NEXT;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.access_v2_compare_all() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_v2_compare_all() TO authenticated, service_role;
