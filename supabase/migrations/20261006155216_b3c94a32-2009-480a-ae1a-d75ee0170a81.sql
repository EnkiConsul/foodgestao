CREATE OR REPLACE FUNCTION public.billing_v2_user_empty_account(_user uuid, _create boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v uuid; v_mail text;
BEGIN
  SELECT a.id INTO v FROM billing_accounts a
   WHERE a.titular_user_id = _user AND a.tipo::text = 'empresa'
     AND NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.billing_account_id = a.id AND b.removed_at IS NULL)
   ORDER BY a.created_at LIMIT 1;
  IF v IS NULL AND _create THEN
    SELECT email INTO v_mail FROM auth.users WHERE id = _user;
    INSERT INTO billing_accounts(tipo, nome, titular_user_id, email_cobranca)
    VALUES ('empresa', COALESCE(upper(v_mail), 'CONTA SEM EMPRESA'), _user, v_mail) RETURNING id INTO v;
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_user_empty_account(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_user_empty_account(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_v2_ensure_company_account(_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_acc uuid; v_c record;
BEGIN
  SELECT billing_account_id INTO v_acc FROM billing_account_companies
   WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  IF v_acc IS NOT NULL THEN RETURN v_acc; END IF;
  SELECT id, user_id, COALESCE(NULLIF(trade_name,''), name) AS nome, cnpj INTO v_c FROM companies WHERE id = _company_id;
  IF v_c.id IS NULL OR v_c.user_id IS NULL THEN RETURN NULL; END IF;

  v_acc := public.billing_v2_user_empty_account(v_c.user_id, false);
  IF v_acc IS NOT NULL THEN
    UPDATE billing_accounts SET nome = COALESCE(v_c.nome, nome), documento_pagador = COALESCE(v_c.cnpj, documento_pagador), updated_at = now()
     WHERE id = v_acc;
  ELSE
    INSERT INTO billing_accounts(tipo, nome, titular_user_id, documento_pagador)
    VALUES ('empresa', COALESCE(v_c.nome, 'Empresa'), v_c.user_id, v_c.cnpj) RETURNING id INTO v_acc;
  END IF;
  INSERT INTO billing_account_companies(billing_account_id, company_id) VALUES (v_acc, _company_id);

  -- assinaturas já na conta reaproveitada: preencher empresa
  UPDATE subscriptions SET company_id = _company_id
   WHERE billing_account_id = v_acc AND company_id IS NULL;
  -- assinaturas do titular sem conta ou em outra conta vazia dele (sem colidir módulo)
  UPDATE subscriptions s SET billing_account_id = v_acc, company_id = COALESCE(s.company_id, _company_id)
   WHERE s.user_id = v_c.user_id
     AND s.status::text NOT IN ('canceled','expired')
     AND (s.company_id IS NULL OR s.company_id = _company_id)
     AND (s.billing_account_id IS NULL OR s.billing_account_id IN (
           SELECT a.id FROM billing_accounts a WHERE a.titular_user_id = v_c.user_id AND a.id <> v_acc
              AND NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.billing_account_id = a.id AND b.removed_at IS NULL)))
     AND NOT EXISTS (SELECT 1 FROM subscriptions o WHERE o.billing_account_id = v_acc AND o.module = s.module
                       AND o.id <> s.id AND o.status::text NOT IN ('canceled','expired'));
  RETURN v_acc;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _plan_id uuid; _trial_days integer; _acc uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local'
     OR EXISTS (SELECT 1 FROM public.company_invites i
                WHERE lower(i.email) = lower(NEW.email) AND i.status::text = 'pending') THEN
    RETURN NEW;
  END IF;
  SELECT id, COALESCE(trial_days, 7) INTO _plan_id, _trial_days
  FROM public.plans WHERE slug = 'financeiro-gestao' AND is_active LIMIT 1;
  IF _plan_id IS NULL THEN
    SELECT id, COALESCE(trial_days, 7) INTO _plan_id, _trial_days
    FROM public.plans WHERE is_active AND module = 'financeiro' AND NOT is_enterprise
    ORDER BY sort_order, created_at LIMIT 1;
  END IF;
  IF _plan_id IS NULL THEN RETURN NEW; END IF;
  BEGIN
    _acc := public.billing_v2_user_empty_account(NEW.id, true);
    INSERT INTO public.subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
    VALUES (NEW.id, _plan_id, 'financeiro',
      CASE WHEN _trial_days > 0 THEN 'trialing'::subscription_status ELSE 'active'::subscription_status END,
      CASE WHEN _trial_days > 0 THEN now() + (_trial_days || ' days')::interval ELSE NULL END,
      now() + interval '1 month', _acc);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.subscription_close_grace_on_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status::text = 'active' AND OLD.status::text IS DISTINCT FROM 'active' THEN
    UPDATE subscription_grants SET revoked_at = now(), revoked_by = public.billing_v2_actor(),
           revoke_reason = CASE COALESCE(current_setting('app.billing_origin', true), '')
                             WHEN 'billing_v2_exempt' THEN 'Substituída por cortesia'
                             ELSE 'Pagamento confirmado' END
     WHERE subscription_id = NEW.id AND tipo = 'carencia' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.billing_v2_exempt(_sub uuid, _plan uuid, _until timestamp with time zone, _motivo subscription_grant_reason, _texto text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _motivo <> 'base_anterior' AND _until IS NULL THEN
    RAISE EXCEPTION 'Informe a data fim: só o motivo "base anterior" aceita isenção sem prazo.';
  END IF;
  PERFORM set_config('app.billing_actor', COALESCE(_actor::text, ''), true);
  PERFORM set_config('app.billing_origin', 'billing_v2_exempt', true);
  UPDATE subscriptions SET is_exempt = true, exempt_until = _until, exempt_reason = _texto,
    exempted_by = _actor, exempted_at = now(), plan_id = _plan, status = 'active',
    external_subscription_id = NULL, canceled_at = NULL, grace_ends_at = NULL
   WHERE id = _sub;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  UPDATE subscription_grants SET revoked_at = now(), revoked_by = _actor,
         revoke_reason = CASE WHEN tipo = 'carencia' THEN 'Substituída por cortesia' ELSE 'Substituída por nova cortesia' END
   WHERE subscription_id = _sub AND tipo IN ('cortesia_total','carencia') AND revoked_at IS NULL;
  INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, ends_at, granted_by)
  VALUES (_sub, 'cortesia_total', _motivo, _texto, _until, _actor);
  PERFORM set_config('app.billing_origin', '', true);
END $$;

CREATE OR REPLACE FUNCTION public.billing_v2_reconciliation()
RETURNS TABLE(tipo text, subscription_id uuid, company_id uuid, detalhe text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
                 AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()));
END $$;