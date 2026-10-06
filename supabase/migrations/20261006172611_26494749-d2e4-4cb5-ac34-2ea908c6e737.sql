
-- ===== PARTE E.1: plans =====
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IN ('essencial','gestao','multiempresa','enterprise')),
  ADD COLUMN IF NOT EXISTS price_monthly_cents integer,
  ADD COLUMN IF NOT EXISTS price_annual_cents integer;

UPDATE public.plans SET
  tier = split_part(slug,'-',2),
  price_monthly_cents = price_cents,
  price_annual_cents = round(price_cents * 12 * (1 - COALESCE(annual_discount_pct,0)/100.0))::int
WHERE slug IN ('financeiro-essencial','financeiro-gestao','financeiro-multiempresa','financeiro-enterprise',
               'pessoas-essencial','pessoas-gestao','pessoas-multiempresa','pessoas-enterprise');
UPDATE public.plans SET features = features || '{"accountant_seats":2}'::jsonb WHERE slug = 'financeiro-multiempresa';

COMMENT ON COLUMN public.subscriptions.quantity IS 'LEGADO — não usar para preço (Fase 1.5).';
COMMENT ON COLUMN public.subscriptions.unit_price_cents IS 'LEGADO — não usar para preço (Fase 1.5).';
COMMENT ON TABLE public.plan_volume_tiers IS 'LEGADO — não usar para preço (Fase 1.5).';

-- ===== E.2 plan_limits =====
CREATE TABLE public.plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  recurso text NOT NULL CHECK (recurso IN ('empresas','usuarios','usuarios_contador','open_finance','unidades','colaboradores')),
  incluido integer NOT NULL DEFAULT 0,
  permite_adicional boolean NOT NULL DEFAULT true,
  max_adicional integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, recurso)
);
GRANT SELECT ON public.plan_limits TO authenticated;
GRANT ALL ON public.plan_limits TO service_role;
ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catálogo legível" ON public.plan_limits FOR SELECT TO authenticated USING (true);

INSERT INTO public.plan_limits (plan_id, recurso, incluido, permite_adicional, max_adicional)
SELECT p.id, v.recurso, v.incluido, v.permite, v.maxa FROM public.plans p
JOIN (VALUES
  ('financeiro-essencial','empresas',1,false,NULL::int),('financeiro-essencial','usuarios',2,true,NULL),
  ('financeiro-essencial','usuarios_contador',1,true,NULL),('financeiro-essencial','open_finance',2,true,NULL),
  ('financeiro-gestao','empresas',2,true,2),('financeiro-gestao','usuarios',5,true,NULL),
  ('financeiro-gestao','usuarios_contador',1,true,NULL),('financeiro-gestao','open_finance',4,true,NULL),
  ('financeiro-multiempresa','empresas',5,true,NULL),('financeiro-multiempresa','usuarios',10,true,NULL),
  ('financeiro-multiempresa','usuarios_contador',2,true,NULL),('financeiro-multiempresa','open_finance',10,true,NULL),
  ('pessoas-essencial','empresas',1,false,NULL),('pessoas-essencial','usuarios',3,true,NULL),
  ('pessoas-essencial','unidades',1,false,NULL),('pessoas-essencial','colaboradores',5,true,NULL),
  ('pessoas-essencial','usuarios_contador',1,true,NULL),
  ('pessoas-gestao','empresas',1,false,NULL),('pessoas-gestao','usuarios',5,true,NULL),
  ('pessoas-gestao','unidades',2,true,NULL),('pessoas-gestao','colaboradores',10,true,NULL),
  ('pessoas-gestao','usuarios_contador',1,true,NULL),
  ('pessoas-multiempresa','empresas',2,true,NULL),('pessoas-multiempresa','usuarios',10,true,NULL),
  ('pessoas-multiempresa','unidades',3,true,NULL),('pessoas-multiempresa','colaboradores',20,true,NULL),
  ('pessoas-multiempresa','usuarios_contador',1,true,NULL)
) AS v(slug,recurso,incluido,permite,maxa) ON v.slug = p.slug;

-- ===== E.3 plan_features =====
CREATE TABLE public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  feature text NOT NULL CHECK (feature IN ('multiunidade','colaborador_entre_unidades','multiempresa')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature)
);
GRANT SELECT ON public.plan_features TO authenticated;
GRANT ALL ON public.plan_features TO service_role;
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Catálogo legível" ON public.plan_features FOR SELECT TO authenticated USING (true);

INSERT INTO public.plan_features (plan_id, feature)
SELECT p.id, v.f FROM public.plans p JOIN (VALUES
  ('pessoas-gestao','multiunidade'),('pessoas-gestao','colaborador_entre_unidades'),
  ('pessoas-multiempresa','multiunidade'),('pessoas-multiempresa','colaborador_entre_unidades'),('pessoas-multiempresa','multiempresa'),
  ('pessoas-enterprise','multiunidade'),('pessoas-enterprise','colaborador_entre_unidades'),('pessoas-enterprise','multiempresa'),
  ('financeiro-multiempresa','multiempresa'),('financeiro-enterprise','multiempresa')
) AS v(slug,f) ON v.slug = p.slug;

-- ===== E.4 addon_catalog (sobre plan_addons, fonte única) =====
ALTER TABLE public.plan_addons
  ADD COLUMN IF NOT EXISTS recurso text,
  ADD COLUMN IF NOT EXISTS inclui jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.plan_addons SET recurso = CASE code WHEN 'contadores' THEN 'usuarios_contador' ELSE code END;
UPDATE public.plan_addons SET inclui = '{"unidades":1}'::jsonb WHERE module = 'pessoas' AND code = 'empresas';

CREATE VIEW public.addon_catalog WITH (security_invoker = true) AS
  SELECT id, module, recurso, price_cents AS price_monthly_cents, inclui, is_active
  FROM public.plan_addons;
GRANT SELECT ON public.addon_catalog TO authenticated;
GRANT ALL ON public.addon_catalog TO service_role;

-- ===== E.5 subscriptions =====
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'mensal' CHECK (billing_cycle IN ('mensal','anual')),
  ADD COLUMN IF NOT EXISTS pending_plan_change jsonb;
COMMENT ON COLUMN public.subscriptions.pending_plan_change IS '{"plan_id": uuid, "effective_at": timestamptz} — downgrade só na renovação.';

-- ===== E.6 subscription_addons =====
ALTER TABLE public.subscription_addons
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'compra' CHECK (origem IN ('compra','cortesia','migracao')),
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;
UPDATE public.subscription_addons SET starts_at = created_at, ends_at = COALESCE(ends_at, canceled_at);

CREATE OR REPLACE FUNCTION public.subscription_addons_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'adicional_incluido',
      jsonb_build_object('addon_id', NEW.addon_id, 'quantidade', NEW.quantity, 'origem', NEW.origem, 'unit_price_cents', NEW.price_cents),
      public.billing_v2_actor());
  ELSIF NEW.ends_at IS NOT NULL AND OLD.ends_at IS NULL THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'adicional_encerrado',
      jsonb_build_object('addon_id', NEW.addon_id, 'ends_at', NEW.ends_at, 'origem', NEW.origem), public.billing_v2_actor());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_addons_event AFTER INSERT OR UPDATE OF ends_at ON public.subscription_addons
  FOR EACH ROW EXECUTE FUNCTION public.subscription_addons_event();

-- ===== E.7 subscription_companies =====
CREATE TABLE public.subscription_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  module text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX subscription_companies_um_modulo ON public.subscription_companies(company_id, module) WHERE removed_at IS NULL;
CREATE INDEX subscription_companies_sub ON public.subscription_companies(subscription_id) WHERE removed_at IS NULL;
GRANT SELECT ON public.subscription_companies TO authenticated;
GRANT ALL ON public.subscription_companies TO service_role;
ALTER TABLE public.subscription_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Titular e super admin leem cobertura" ON public.subscription_companies FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR EXISTS (
  SELECT 1 FROM subscriptions s JOIN billing_accounts a ON a.id = s.billing_account_id
  WHERE s.id = subscription_id AND a.titular_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.subscription_companies_before()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT COALESCE(s.module, p.module, 'financeiro') INTO NEW.module
    FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id WHERE s.id = NEW.subscription_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_companies_before BEFORE INSERT ON public.subscription_companies
  FOR EACH ROW EXECUTE FUNCTION public.subscription_companies_before();

CREATE OR REPLACE FUNCTION public.subscription_companies_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'empresa_coberta', jsonb_build_object('company_id', NEW.company_id, 'module', NEW.module), public.billing_v2_actor());
  ELSIF NEW.removed_at IS NOT NULL AND OLD.removed_at IS NULL THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (NEW.subscription_id, 'empresa_descoberta', jsonb_build_object('company_id', NEW.company_id, 'module', NEW.module), public.billing_v2_actor());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscription_companies_event AFTER INSERT OR UPDATE OF removed_at ON public.subscription_companies
  FOR EACH ROW EXECUTE FUNCTION public.subscription_companies_event();

-- ===== E.8 account_limit_overrides =====
CREATE TABLE public.account_limit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id),
  module text NOT NULL CHECK (module IN ('financeiro','pessoas')),
  recurso text NOT NULL CHECK (recurso IN ('empresas','usuarios','usuarios_contador','open_finance','unidades','colaboradores')),
  limite integer NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_account_id, module, recurso)
);
GRANT SELECT, INSERT, UPDATE ON public.account_limit_overrides TO authenticated;
GRANT ALL ON public.account_limit_overrides TO service_role;
ALTER TABLE public.account_limit_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Titular e super admin leem limites" ON public.account_limit_overrides FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR EXISTS (SELECT 1 FROM billing_accounts a WHERE a.id = billing_account_id AND a.titular_user_id = auth.uid()));
CREATE POLICY "Só super admin cria limites" ON public.account_limit_overrides FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "Só super admin altera limites" ON public.account_limit_overrides FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER trg_account_limit_overrides_updated BEFORE UPDATE ON public.account_limit_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== F.2 trial_usage =====
CREATE TABLE public.trial_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_user_id uuid,
  email text,
  documento_titular text,
  cnpj_empresa text,
  module text NOT NULL,
  plan_id uuid REFERENCES public.plans(id),
  subscription_id uuid REFERENCES public.subscriptions(id),
  origem text NOT NULL DEFAULT 'cadastro',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trial_usage_email ON public.trial_usage(lower(email));
CREATE INDEX trial_usage_doc ON public.trial_usage(documento_titular) WHERE documento_titular IS NOT NULL;
CREATE INDEX trial_usage_cnpj ON public.trial_usage(cnpj_empresa) WHERE cnpj_empresa IS NOT NULL;
GRANT SELECT ON public.trial_usage TO authenticated;
GRANT ALL ON public.trial_usage TO service_role;
ALTER TABLE public.trial_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Só super admin lê testes" ON public.trial_usage FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.trial_usage_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Registro de teste grátis é permanente e não pode ser apagado.'; END $$;
CREATE TRIGGER trg_trial_usage_no_delete BEFORE DELETE ON public.trial_usage FOR EACH ROW EXECUTE FUNCTION public.trial_usage_no_delete();

INSERT INTO public.system_parameters(key, value, description)
VALUES ('trial_cadastro_dias', '7'::jsonb, 'Dias de teste grátis concedidos uma única vez no cadastro do titular')
ON CONFLICT (key) DO NOTHING;

-- ===== utilitários =====
CREATE OR REPLACE FUNCTION public.billing_v2_digits(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(COALESCE(_t,''), '\D', '', 'g'), '') $$;

-- uso atual por assinatura e recurso (empresas cobertas)
CREATE OR REPLACE FUNCTION public._billing_v2_usage(_sub uuid, _recurso text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v int; v_ini date := date_trunc('month', now())::date; v_fim date := (date_trunc('month', now()) + interval '1 month')::date;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _cov(company_id uuid) ON COMMIT DROP;
  IF _recurso = 'empresas' THEN
    SELECT count(*) INTO v FROM subscription_companies WHERE subscription_id = _sub AND removed_at IS NULL;
  ELSIF _recurso = 'usuarios' THEN
    SELECT count(DISTINCT m.user_id) INTO v FROM company_members m
     JOIN subscription_companies sc ON sc.company_id = m.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE m.situacao = 'ativo' AND m.role::text <> 'contabilidade';
  ELSIF _recurso = 'usuarios_contador' THEN
    SELECT count(DISTINCT m.user_id) INTO v FROM company_members m
     JOIN subscription_companies sc ON sc.company_id = m.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE m.situacao = 'ativo' AND m.role::text = 'contabilidade';
  ELSIF _recurso = 'open_finance' THEN
    SELECT count(*) INTO v FROM pluggy_connections p
     JOIN subscription_companies sc ON sc.company_id = p.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE p.status::text NOT IN ('deleted','revoked');
  ELSIF _recurso = 'unidades' THEN
    SELECT count(*) INTO v FROM dp_unidades u
     JOIN subscription_companies sc ON sc.company_id = u.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE u.ativo;
  ELSIF _recurso = 'colaboradores' THEN
    SELECT count(*) INTO v FROM dp_colaboradores c
     JOIN subscription_companies sc ON sc.company_id = c.company_id AND sc.subscription_id = _sub AND sc.removed_at IS NULL
     WHERE c.ativo AND c.deleted_at IS NULL AND c.data_desligamento IS NULL
       AND (c.regime::text NOT IN ('intermitente','freelancer')
            OR EXISTS (SELECT 1 FROM dp_convocacoes cv WHERE cv.colaborador_id = c.id AND cv.status::text = 'aceita' AND cv.data >= v_ini AND cv.data < v_fim)
            OR EXISTS (SELECT 1 FROM dp_escala_itens e WHERE e.colaborador_id = c.id AND e.data >= v_ini AND e.data < v_fim));
  ELSE v := 0;
  END IF;
  RETURN COALESCE(v, 0);
END $$;

-- limites efetivos (sem checagem de permissão; uso interno)
CREATE OR REPLACE FUNCTION public._billing_v2_limits(_sub uuid)
RETURNS TABLE(recurso text, incluido integer, adicional integer, override integer, limite integer, uso integer, saldo integer,
              permite_adicional boolean, max_adicional integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record;
BEGIN
  SELECT sub.id, sub.plan_id, sub.billing_account_id, COALESCE(sub.module, p.module) AS module
    INTO s FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id WHERE sub.id = _sub;
  IF s.id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH r(recurso) AS (VALUES ('empresas'),('usuarios'),('usuarios_contador'),('open_finance'),('unidades'),('colaboradores')),
  ad AS (
    SELECT pa.recurso AS rec, sum(sa.quantity)::int AS q FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
     WHERE sa.subscription_id = _sub AND sa.status = 'active' AND sa.starts_at <= now() AND (sa.ends_at IS NULL OR sa.ends_at > now())
     GROUP BY pa.recurso
    UNION ALL
    SELECT k.key, sum(sa.quantity * (k.value)::int)::int FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
     CROSS JOIN LATERAL jsonb_each_text(pa.inclui) k
     WHERE sa.subscription_id = _sub AND sa.status = 'active' AND sa.starts_at <= now() AND (sa.ends_at IS NULL OR sa.ends_at > now())
     GROUP BY k.key
  ),
  base AS (
    SELECT r.recurso, pl.incluido, COALESCE((SELECT sum(q) FROM ad WHERE ad.rec = r.recurso),0)::int AS adicional,
           o.limite AS override, pl.permite_adicional, pl.max_adicional, pl.id IS NOT NULL AS tem
      FROM r LEFT JOIN plan_limits pl ON pl.plan_id = s.plan_id AND pl.recurso = r.recurso
      LEFT JOIN account_limit_overrides o ON o.billing_account_id = s.billing_account_id AND o.module = s.module AND o.recurso = r.recurso
  )
  SELECT b.recurso, b.incluido, b.adicional, b.override,
         CASE WHEN b.override IS NOT NULL THEN b.override WHEN b.tem THEN b.incluido + b.adicional ELSE NULL END,
         public._billing_v2_usage(_sub, b.recurso),
         CASE WHEN b.override IS NOT NULL THEN b.override WHEN b.tem THEN b.incluido + b.adicional ELSE NULL END - public._billing_v2_usage(_sub, b.recurso),
         COALESCE(b.permite_adicional, false), b.max_adicional
    FROM base b WHERE b.tem OR b.override IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.effective_limits(_subscription_id uuid)
RETURNS TABLE(recurso text, incluido integer, adicional integer, override integer, limite integer, uso integer, saldo integer,
              permite_adicional boolean, max_adicional integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin(auth.uid()) AND NOT EXISTS (
     SELECT 1 FROM subscriptions s JOIN billing_accounts a ON a.id = s.billing_account_id
      WHERE s.id = _subscription_id AND a.titular_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar os limites desta assinatura.';
  END IF;
  RETURN QUERY SELECT * FROM public._billing_v2_limits(_subscription_id);
END $$;

-- verificação de regra de contratação
CREATE OR REPLACE FUNCTION public.plan_rule_check(_subscription_id uuid, _recurso text, _qtd_desejada integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; l record; v_extra int; v_addon record; v_custo int := 0; v_prorata int := 0;
        v_dias_rest numeric; v_dias_per numeric; v_atual int; v_up record; v_disc numeric;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_super_admin(auth.uid()) AND NOT EXISTS (
     SELECT 1 FROM subscriptions x JOIN billing_accounts a ON a.id = x.billing_account_id
      WHERE x.id = _subscription_id AND a.titular_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar esta assinatura.';
  END IF;
  SELECT sub.*, p.slug, p.tier, p.price_monthly_cents AS preco, p.annual_discount_pct AS disc, COALESCE(sub.module, p.module) AS mod
    INTO s FROM subscriptions sub JOIN plans p ON p.id = sub.plan_id WHERE sub.id = _subscription_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  SELECT * INTO l FROM public._billing_v2_limits(_subscription_id) x WHERE x.recurso = _recurso;
  IF l.recurso IS NULL OR l.limite IS NULL THEN
    RETURN jsonb_build_object('permitido', false, 'motivo', 'recurso_nao_previsto_no_plano', 'opcoes', '["contato_comercial"]'::jsonb);
  END IF;
  IF _qtd_desejada <= l.limite THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'franquia', 'opcoes', '["franquia"]'::jsonb,
      'limite', l.limite, 'uso', l.uso, 'custo_mensal_cents', 0, 'prorata_cents', 0);
  END IF;
  v_extra := _qtd_desejada - l.limite;
  SELECT pa.* INTO v_addon FROM plan_addons pa WHERE pa.module = s.mod AND pa.recurso = _recurso AND pa.is_active LIMIT 1;
  v_atual := s.preco + COALESCE((SELECT sum(sa.price_cents * sa.quantity) FROM subscription_addons sa
     WHERE sa.subscription_id = _subscription_id AND sa.status = 'active' AND sa.origem <> 'cortesia'
       AND (sa.ends_at IS NULL OR sa.ends_at > now())), 0)::int;

  IF l.override IS NULL AND l.permite_adicional AND v_addon.id IS NOT NULL
     AND (l.max_adicional IS NULL OR l.adicional + v_extra <= l.max_adicional) THEN
    v_custo := v_addon.price_cents * v_extra;
    v_disc := CASE WHEN s.billing_cycle = 'anual' THEN COALESCE(s.disc,0)/100.0 ELSE 0 END;
    v_dias_per := GREATEST(1, EXTRACT(EPOCH FROM (COALESCE(s.current_period_end, now() + interval '1 month')
                    - COALESCE(s.current_period_start, COALESCE(s.current_period_end, now() + interval '1 month') - interval '1 month')))/86400);
    v_dias_rest := GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(s.current_period_end, now() + interval '1 month') - now()))/86400);
    IF s.billing_cycle = 'anual' THEN
      v_prorata := round(v_custo * (1 - v_disc) * v_dias_rest / 30.0);
    ELSE
      v_prorata := round(v_custo * LEAST(1, v_dias_rest / v_dias_per));
    END IF;
  ELSE
    v_custo := NULL;
  END IF;

  SELECT p.slug, p.name, p.price_monthly_cents INTO v_up
    FROM plans p JOIN plan_limits pl ON pl.plan_id = p.id AND pl.recurso = _recurso
   WHERE p.module = s.mod AND p.is_active AND NOT COALESCE(p.is_enterprise,false) AND p.price_monthly_cents > s.preco
     AND pl.incluido >= _qtd_desejada
   ORDER BY p.price_monthly_cents LIMIT 1;

  IF v_custo IS NOT NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'adicional',
      'opcoes', CASE WHEN _recurso = 'empresas' THEN '["adicional","upgrade","conta_separada"]'::jsonb ELSE '["adicional","upgrade"]'::jsonb END,
      'limite', l.limite, 'uso', l.uso, 'quantidade_adicional', v_extra, 'addon_id', v_addon.id,
      'custo_mensal_cents', v_custo, 'prorata_cents', v_prorata, 'inclui', v_addon.inclui,
      'custo_total_mensal_cents', v_atual + v_custo,
      'sugestao_upgrade', CASE WHEN v_up.slug IS NOT NULL AND v_up.price_monthly_cents < v_atual + v_custo
          THEN jsonb_build_object('plano', v_up.slug, 'nome', v_up.name, 'preco_mensal_cents', v_up.price_monthly_cents,
                                  'economia_mensal_cents', v_atual + v_custo - v_up.price_monthly_cents) END);
  END IF;
  RETURN jsonb_build_object('permitido', false,
    'motivo', CASE WHEN NOT l.permite_adicional THEN 'adicional_proibido_pelo_plano' ELSE 'teto_de_adicionais_atingido' END,
    'opcoes', CASE WHEN _recurso = 'empresas' THEN '["upgrade","conta_separada"]'::jsonb ELSE '["upgrade"]'::jsonb END,
    'limite', l.limite, 'uso', l.uso,
    'sugestao_upgrade', CASE WHEN v_up.slug IS NOT NULL THEN jsonb_build_object('plano', v_up.slug, 'nome', v_up.name, 'preco_mensal_cents', v_up.price_monthly_cents) END);
END $$;

-- ===== E.9 inclusão controlada de empresa (empresa → grupo) =====
CREATE OR REPLACE FUNCTION public.billing_v2_add_company_to_account(_account uuid, _company uuid, _actor uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo text; v_sub record;
BEGIN
  PERFORM set_config('app.billing_actor', COALESCE(_actor::text, ''), true);
  SELECT tipo::text INTO v_tipo FROM billing_accounts WHERE id = _account FOR UPDATE;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'Conta de cobrança não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM billing_account_companies WHERE billing_account_id = _account AND company_id = _company AND removed_at IS NULL) THEN
    RETURN _account;
  END IF;
  IF v_tipo = 'empresa' AND EXISTS (SELECT 1 FROM billing_account_companies WHERE billing_account_id = _account AND removed_at IS NULL) THEN
    UPDATE billing_accounts SET tipo = 'grupo', updated_at = now() WHERE id = _account;
    FOR v_sub IN SELECT id FROM subscriptions WHERE billing_account_id = _account AND status::text NOT IN ('canceled','expired') LOOP
      INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
      VALUES (v_sub.id, 'conta_convertida_grupo', jsonb_build_object('billing_account_id', _account, 'company_id', _company), _actor);
    END LOOP;
  END IF;
  UPDATE billing_account_companies SET removed_at = now() WHERE company_id = _company AND removed_at IS NULL;
  INSERT INTO billing_account_companies(billing_account_id, company_id) VALUES (_account, _company);
  RETURN _account;
END $$;

-- ===== F.3 trial só no cadastro =====
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plan_id uuid; _dias integer; _acc uuid; _mod text; _doc text; _sub uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local'
     OR EXISTS (SELECT 1 FROM public.company_invites i
                WHERE lower(i.email) = lower(NEW.email) AND i.status::text = 'pending') THEN
    RETURN NEW;
  END IF;
  _mod := CASE WHEN NEW.raw_user_meta_data->>'trial_module' = 'pessoas' THEN 'pessoas' ELSE 'financeiro' END;
  _doc := public.billing_v2_digits(COALESCE(NEW.raw_user_meta_data->>'cpf', NEW.raw_user_meta_data->>'document'));
  -- teste grátis já utilizado por este e-mail/CPF: conta nasce sem teste
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
  RETURN NEW;
END $$;

-- ===== F.4 primeira empresa: cobertura + CNPJ do teste =====
CREATE OR REPLACE FUNCTION public.billing_v2_ensure_company_account(_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acc uuid; v_c record; v_s record; v_cnpj text;
BEGIN
  SELECT billing_account_id INTO v_acc FROM billing_account_companies
   WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  IF v_acc IS NOT NULL THEN RETURN v_acc; END IF;
  SELECT id, user_id, COALESCE(NULLIF(trade_name,''), name) AS nome, cnpj INTO v_c FROM companies WHERE id = _company_id;
  IF v_c.id IS NULL OR v_c.user_id IS NULL THEN RETURN NULL; END IF;
  v_cnpj := public.billing_v2_digits(v_c.cnpj);

  v_acc := public.billing_v2_user_empty_account(v_c.user_id, false);
  IF v_acc IS NOT NULL THEN
    UPDATE billing_accounts SET nome = COALESCE(v_c.nome, nome), documento_pagador = COALESCE(v_c.cnpj, documento_pagador), updated_at = now()
     WHERE id = v_acc;
  ELSE
    INSERT INTO billing_accounts(tipo, nome, titular_user_id, documento_pagador)
    VALUES ('empresa', COALESCE(v_c.nome, 'Empresa'), v_c.user_id, v_c.cnpj) RETURNING id INTO v_acc;
  END IF;
  INSERT INTO billing_account_companies(billing_account_id, company_id) VALUES (v_acc, _company_id);

  UPDATE subscriptions SET company_id = _company_id
   WHERE billing_account_id = v_acc AND company_id IS NULL;
  UPDATE subscriptions s SET billing_account_id = v_acc, company_id = COALESCE(s.company_id, _company_id)
   WHERE s.user_id = v_c.user_id
     AND s.status::text NOT IN ('canceled','expired')
     AND (s.company_id IS NULL OR s.company_id = _company_id)
     AND (s.billing_account_id IS NULL OR s.billing_account_id IN (
           SELECT a.id FROM billing_accounts a WHERE a.titular_user_id = v_c.user_id AND a.id <> v_acc
              AND NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.billing_account_id = a.id AND b.removed_at IS NULL)))
     AND NOT EXISTS (SELECT 1 FROM subscriptions o WHERE o.billing_account_id = v_acc AND o.module = s.module
                       AND o.id <> s.id AND o.status::text NOT IN ('canceled','expired'));

  -- primeira empresa da conta: passa a ser coberta pelas assinaturas da conta
  FOR v_s IN SELECT s.id, s.status::text AS st, s.module FROM subscriptions s
     WHERE s.billing_account_id = v_acc AND s.status::text NOT IN ('canceled','expired')
       AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.subscription_id = s.id AND sc.removed_at IS NULL)
  LOOP
    IF v_s.st = 'trialing' AND v_cnpj IS NOT NULL AND EXISTS (
         SELECT 1 FROM trial_usage t WHERE t.cnpj_empresa = v_cnpj AND t.subscription_id IS DISTINCT FROM v_s.id) THEN
      UPDATE subscriptions SET trial_ends_at = now() WHERE id = v_s.id;
      INSERT INTO subscription_events(subscription_id, tipo_evento, status_anterior, status_novo, payload, actor_id)
      VALUES (v_s.id, 'trial_encerrado_cnpj_ja_utilizado', 'trialing', 'trialing',
              jsonb_build_object('company_id', _company_id, 'cnpj', v_cnpj, 'email_pendente', true), public.billing_v2_actor());
      UPDATE trial_usage SET cnpj_empresa = v_cnpj, ends_at = now() WHERE subscription_id = v_s.id;
    ELSE
      IF v_s.st = 'trialing' THEN
        UPDATE trial_usage SET cnpj_empresa = v_cnpj WHERE subscription_id = v_s.id AND cnpj_empresa IS NULL;
      END IF;
      BEGIN
        INSERT INTO subscription_companies(subscription_id, company_id) VALUES (v_s.id, _company_id);
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END IF;
  END LOOP;
  RETURN v_acc;
END $$;

-- ===== PARTE H: conciliação =====
CREATE OR REPLACE FUNCTION public.billing_v2_reconciliation()
RETURNS TABLE(tipo text, subscription_id uuid, company_id uuid, detalhe text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o super admin pode rodar a conciliação.';
  END IF;
  RETURN QUERY
  SELECT 'assinatura_sem_conta', s.id, s.company_id, s.status::text FROM subscriptions s WHERE s.billing_account_id IS NULL
  UNION ALL
  SELECT 'empresa_sem_conta', NULL::uuid, c.id, c.name FROM companies c
   WHERE NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.company_id = c.id AND b.removed_at IS NULL)
  UNION ALL
  SELECT 'isencao_sem_concessao', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired') AND s.is_exempt AND (s.exempt_until IS NULL OR s.exempt_until >= now())
     AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'cortesia_total'
                     AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
  UNION ALL
  SELECT 'concessao_sem_isencao', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired')
     AND EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'cortesia_total'
                 AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
     AND NOT (s.is_exempt AND (s.exempt_until IS NULL OR s.exempt_until >= now()))
  UNION ALL
  SELECT 'carencia_sem_concessao', s.id, s.company_id, s.grace_ends_at::text FROM subscriptions s
   WHERE s.status::text = 'grace'
     AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia' AND g.revoked_at IS NULL)
  UNION ALL
  SELECT 'empresa_sem_assinatura_na_conta', NULL::uuid, c.id, a.nome FROM companies c
    JOIN billing_account_companies b ON b.company_id = c.id AND b.removed_at IS NULL
    JOIN billing_accounts a ON a.id = b.billing_account_id
   WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.billing_account_id = a.id AND s.status::text NOT IN ('canceled','expired'))
     AND EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.user_id = a.titular_user_id AND s2.status::text NOT IN ('canceled','expired')
                   AND s2.billing_account_id IS DISTINCT FROM a.id)
  UNION ALL
  SELECT 'conta_vazia_com_assinatura_ativa', s.id, s.company_id, a.nome FROM subscriptions s
    JOIN billing_accounts a ON a.id = s.billing_account_id
   WHERE s.status::text NOT IN ('canceled','expired') AND s.created_at < now() - interval '30 days'
     AND NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.billing_account_id = a.id AND b.removed_at IS NULL)
  UNION ALL
  SELECT 'carencia_ativa_sem_grace', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text <> 'grace'
     AND EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia'
                 AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
  -- Fase 1.5
  UNION ALL
  SELECT 'cobertura_excede_franquia', s.id, s.company_id, format('%s empresas cobertas, limite %s', l.uso, l.limite)
    FROM subscriptions s CROSS JOIN LATERAL public._billing_v2_limits(s.id) l
   WHERE s.status::text NOT IN ('canceled','expired') AND l.recurso = 'empresas' AND l.limite IS NOT NULL AND l.uso > l.limite
  UNION ALL
  SELECT 'adicional_proibido_pelo_plano', s.id, s.company_id, format('%s: %s empresas, plano permite %s sem adicional', p.slug, l.uso, l.incluido)
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id CROSS JOIN LATERAL public._billing_v2_limits(s.id) l
   WHERE s.status::text NOT IN ('canceled','expired') AND l.recurso = 'empresas' AND NOT l.permite_adicional
     AND l.override IS NULL AND l.uso > l.incluido
  UNION ALL
  SELECT 'empresa_sem_cobertura_no_modulo', s.id, b.company_id, s.module FROM subscriptions s
    JOIN billing_account_companies b ON b.billing_account_id = s.billing_account_id AND b.removed_at IS NULL
   WHERE s.status::text NOT IN ('canceled','expired')
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.company_id = b.company_id AND sc.module = s.module AND sc.removed_at IS NULL)
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'e-mail ' || k FROM (SELECT lower(email) k FROM trial_usage WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CPF ' || k FROM (SELECT documento_titular k FROM trial_usage WHERE documento_titular IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CNPJ ' || k FROM (SELECT cnpj_empresa k FROM trial_usage WHERE cnpj_empresa IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'plano_fora_do_catalogo', s.id, s.company_id, p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id
   WHERE s.status::text NOT IN ('canceled','expired') AND NOT p.is_active;
END $$;

-- ===== privilégios das rotinas =====
REVOKE ALL ON FUNCTION public._billing_v2_usage(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._billing_v2_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.effective_limits(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.plan_rule_check(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_v2_add_company_to_account(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_addons_event() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_companies_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._billing_v2_usage(uuid, text), public._billing_v2_limits(uuid), public.effective_limits(uuid),
  public.plan_rule_check(uuid, text, integer), public.billing_v2_add_company_to_account(uuid, uuid, uuid) TO service_role;
