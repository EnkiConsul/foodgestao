CREATE OR REPLACE FUNCTION public.admin_assinaturas_lista(p_escopo text DEFAULT 'contratantes')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso restrito ao super admin.' USING ERRCODE = '42501'; END IF;
  IF p_escopo NOT IN ('contratantes','sem_contratacao','teste') THEN RAISE EXCEPTION 'Escopo inválido: %', p_escopo; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'created_at') DESC), '[]'::jsonb) INTO r FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'user_id', s.user_id, 'plan_id', s.plan_id, 'company_id', s.company_id,
      'billing_account_id', s.billing_account_id, 'module', s.module, 'status', s.status,
      'billing_cycle', s.billing_cycle, 'started_at', s.started_at, 'current_period_end', s.current_period_end,
      'trial_ends_at', s.trial_ends_at, 'canceled_at', s.canceled_at, 'grace_ends_at', s.grace_ends_at,
      'is_exempt', s.is_exempt, 'exempt_until', s.exempt_until, 'exempt_reason', s.exempt_reason,
      'external_subscription_id', s.external_subscription_id, 'created_at', s.created_at,
      'plan', (SELECT jsonb_build_object('id', pl.id, 'name', pl.name, 'slug', pl.slug, 'price_cents', pl.price_cents, 'billing_period', pl.billing_period) FROM plans pl WHERE pl.id = s.plan_id),
      'company', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'trade_name', c.trade_name, 'cnpj', c.cnpj) FROM companies c WHERE c.id = s.company_id),
      'addons', coalesce((SELECT jsonb_agg(jsonb_build_object('id', ad.id, 'quantity', ad.quantity, 'status', ad.status, 'price_cents', ad.price_cents, 'is_exempt', ad.is_exempt, 'prorata_cents', ad.prorata_cents, 'prorata_billed_at', ad.prorata_billed_at)) FROM subscription_addons ad WHERE ad.subscription_id = s.id), '[]'::jsonb),
      'papel_usuario', CASE WHEN s.company_id IS NULL THEN 'sem_contratacao'
                            WHEN a.titular_user_id IS NOT NULL AND s.user_id = a.titular_user_id THEN 'titular'
                            ELSE 'outro' END,
      'colaboradores_ativos', (SELECT count(*) FROM dp_colaboradores d JOIN billing_account_companies b ON b.company_id = d.company_id
          AND b.billing_account_id = a.id AND b.removed_at IS NULL
          WHERE d.deleted_at IS NULL AND coalesce(d.ativo, true) AND d.data_desligamento IS NULL),
      'admins_equipe', (SELECT count(DISTINCT m.user_id) FROM billing_account_companies b JOIN company_members m ON m.company_id = b.company_id
          WHERE b.billing_account_id = a.id AND b.removed_at IS NULL AND m.user_id <> a.titular_user_id
            AND NOT EXISTS (SELECT 1 FROM dp_colaboradores d WHERE d.user_id = m.user_id)),
      'is_test', coalesce(a.is_test, false), 'is_internal', coalesce(a.is_internal, false),
      'email', u.email, 'cadastro_em', u.created_at,
      'is_colaborador', EXISTS (SELECT 1 FROM dp_colaboradores d WHERE d.user_id = s.user_id),
      'is_equipe_admin', EXISTS (SELECT 1 FROM company_members m WHERE m.user_id = s.user_id AND m.role::text <> 'owner')
    ) x
    FROM subscriptions s
    LEFT JOIN billing_accounts a ON a.id = s.billing_account_id
    LEFT JOIN auth.users u ON u.id = s.user_id
    WHERE CASE p_escopo
      WHEN 'contratantes' THEN a.asaas_env = 'production' AND NOT coalesce(a.is_test, false) AND s.company_id IS NOT NULL
      WHEN 'sem_contratacao' THEN s.company_id IS NULL AND NOT coalesce(a.is_test, false)
      ELSE coalesce(a.is_test, false) END
  ) t;
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.admin_assinaturas_lista(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assinaturas_lista(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _plan_id uuid; _dias integer; _acc uuid; _mod text; _doc text; _sub uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local' THEN
    RETURN NEW;
  END IF;
  -- só o cadastro público de titular (useAuth.signUp) envia signup_origin = 'titular'
  IF COALESCE(NEW.raw_user_meta_data->>'signup_origin','') <> 'titular' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_colaboradores d WHERE d.user_id = NEW.id)
     OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.user_id = NEW.id) THEN
    RETURN NEW;
  END IF;
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
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;