-- C1/C2: guarda de unicidade
CREATE OR REPLACE FUNCTION public.subscriptions_v2_unique_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.billing_account_id IS NOT DISTINCT FROM OLD.billing_account_id
     AND NEW.module IS NOT DISTINCT FROM OLD.module THEN
    RETURN NEW;
  END IF;
  IF NEW.billing_account_id IS NOT NULL AND NEW.status::text NOT IN ('canceled','expired')
     AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.billing_account_id = NEW.billing_account_id
                 AND COALESCE(s.module,'') = COALESCE(NEW.module,'') AND s.id <> NEW.id
                 AND s.status::text NOT IN ('canceled','expired')) THEN
    RAISE EXCEPTION 'Já existe assinatura ativa deste módulo para a conta de cobrança.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscriptions_v2_unique ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_v2_unique BEFORE INSERT OR UPDATE OF billing_account_id, module
  ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.subscriptions_v2_unique_guard();

-- B7: ator explícito nos eventos de status
CREATE OR REPLACE FUNCTION public.billing_v2_actor()
RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(auth.uid(), NULLIF(current_setting('app.billing_actor', true), '')::uuid)
$$;
REVOKE ALL ON FUNCTION public.billing_v2_actor() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.subscription_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO subscription_events(subscription_id, tipo_evento, status_anterior, status_novo, actor_id)
    VALUES (NEW.id, 'status_alterado', OLD.status::text, NEW.status::text, public.billing_v2_actor());
  END IF;
  RETURN NEW;
END $$;

-- B4: pagamento/ativação encerra a carência vigente
CREATE OR REPLACE FUNCTION public.subscription_close_grace_on_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status::text = 'active' AND OLD.status::text IS DISTINCT FROM 'active' THEN
    UPDATE subscription_grants SET revoked_at = now(), revoked_by = public.billing_v2_actor(),
           revoke_reason = 'Assinatura ativada (pagamento confirmado)'
     WHERE subscription_id = NEW.id AND tipo = 'carencia' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscription_close_grace ON public.subscriptions;
CREATE TRIGGER trg_subscription_close_grace AFTER UPDATE OF status ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_close_grace_on_active();

-- B5: nova assinatura vincula conta de cobrança
CREATE OR REPLACE FUNCTION public.billing_v2_ensure_company_account(_company_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_acc uuid; v_c record;
BEGIN
  SELECT billing_account_id INTO v_acc FROM billing_account_companies
   WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  IF v_acc IS NOT NULL THEN RETURN v_acc; END IF;
  SELECT id, user_id, COALESCE(NULLIF(trade_name,''), name) AS nome, cnpj INTO v_c FROM companies WHERE id = _company_id;
  IF v_c.id IS NULL OR v_c.user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO billing_accounts(tipo, nome, titular_user_id, documento_pagador)
  VALUES ('empresa', COALESCE(v_c.nome, 'Empresa'), v_c.user_id, v_c.cnpj) RETURNING id INTO v_acc;
  INSERT INTO billing_account_companies(billing_account_id, company_id) VALUES (v_acc, _company_id);
  RETURN v_acc;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_ensure_company_account(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_ensure_company_account(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.subscriptions_v2_link_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.billing_account_id IS NULL AND NEW.company_id IS NOT NULL THEN
    NEW.billing_account_id := public.billing_v2_ensure_company_account(NEW.company_id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscriptions_v2_link_account ON public.subscriptions;
CREATE TRIGGER subscriptions_v2_link_account BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_v2_link_account();

-- B6: nova empresa ganha conta própria (nunca entra em grupo automaticamente)
CREATE OR REPLACE FUNCTION public.companies_v2_billing_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.billing_v2_ensure_company_account(NEW.id);
  UPDATE subscriptions s SET billing_account_id = (SELECT billing_account_id FROM billing_account_companies
         WHERE company_id = NEW.id AND removed_at IS NULL LIMIT 1)
   WHERE s.company_id = NEW.id AND s.billing_account_id IS NULL;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_v2_billing_account ON public.companies;
CREATE TRIGGER companies_v2_billing_account AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_v2_billing_account();

-- B1/B2/B3: operações atômicas do painel (service role, ator explícito)
CREATE OR REPLACE FUNCTION public.billing_v2_exempt(_sub uuid, _plan uuid, _until timestamptz,
  _motivo public.subscription_grant_reason, _texto text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _motivo <> 'base_anterior' AND _until IS NULL THEN
    RAISE EXCEPTION 'Informe a data fim: só o motivo "base anterior" aceita isenção sem prazo.';
  END IF;
  PERFORM set_config('app.billing_actor', COALESCE(_actor::text, ''), true);
  UPDATE subscriptions SET is_exempt = true, exempt_until = _until, exempt_reason = _texto,
    exempted_by = _actor, exempted_at = now(), plan_id = _plan, status = 'active',
    external_subscription_id = NULL, canceled_at = NULL, grace_ends_at = NULL
   WHERE id = _sub;
  IF NOT FOUND THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  UPDATE subscription_grants SET revoked_at = now(), revoked_by = _actor, revoke_reason = 'Substituída por nova cortesia'
   WHERE subscription_id = _sub AND tipo IN ('cortesia_total','carencia') AND revoked_at IS NULL;
  INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, ends_at, granted_by)
  VALUES (_sub, 'cortesia_total', _motivo, _texto, _until, _actor);
END $$;

CREATE OR REPLACE FUNCTION public.billing_v2_revoke_exemption(_sub uuid, _grace_ends timestamptz, _reason text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('app.billing_actor', COALESCE(_actor::text, ''), true);
  UPDATE subscriptions SET status = 'grace', is_exempt = false, exempt_until = NULL, exempt_reason = NULL,
    grace_ends_at = _grace_ends, exempted_by = NULL, exempted_at = NULL, dunning_stage = 0
   WHERE id = _sub AND is_exempt;
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta assinatura não está isenta.'; END IF;
  UPDATE subscription_grants SET revoked_at = now(), revoked_by = _actor, revoke_reason = _reason
   WHERE subscription_id = _sub AND tipo = 'cortesia_total' AND revoked_at IS NULL;
  INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, ends_at, granted_by)
  VALUES (_sub, 'carencia', 'outro', _reason, _grace_ends, _actor);
END $$;

CREATE OR REPLACE FUNCTION public.billing_v2_start_grace(_sub uuid, _grace_ends timestamptz, _reason text, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('app.billing_actor', COALESCE(_actor::text, ''), true);
  UPDATE subscriptions SET status = 'grace', grace_ends_at = _grace_ends, dunning_stage = 0
   WHERE id = _sub AND status = 'active' AND NOT is_exempt AND external_subscription_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Só é possível iniciar carência em assinatura ativa, não isenta e sem cobrança no Asaas.';
  END IF;
  INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, ends_at, granted_by)
  VALUES (_sub, 'carencia', 'outro', _reason, _grace_ends, _actor);
END $$;

REVOKE ALL ON FUNCTION public.billing_v2_exempt(uuid,uuid,timestamptz,public.subscription_grant_reason,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_v2_revoke_exemption(uuid,timestamptz,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_v2_start_grace(uuid,timestamptz,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_v2_exempt(uuid,uuid,timestamptz,public.subscription_grant_reason,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_v2_revoke_exemption(uuid,timestamptz,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_v2_start_grace(uuid,timestamptz,text,uuid) TO service_role;

-- C4: colaborador do portal / convidado não gera assinatura
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _plan_id uuid; _trial_days integer;
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
    INSERT INTO public.subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end)
    VALUES (NEW.id, _plan_id, 'financeiro',
      CASE WHEN _trial_days > 0 THEN 'trialing'::subscription_status ELSE 'active'::subscription_status END,
      CASE WHEN _trial_days > 0 THEN now() + (_trial_days || ' days')::interval ELSE NULL END,
      now() + interval '1 month');
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END $$;

-- D: conciliação
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
     AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia' AND g.revoked_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_reconciliation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_reconciliation() TO authenticated, service_role;

-- C3: grace sem concessão
INSERT INTO subscription_grants(subscription_id, tipo, motivo_codigo, motivo_texto, ends_at)
SELECT s.id, 'carencia', 'outro', 'Migração: carência existente', s.grace_ends_at FROM subscriptions s
 WHERE s.status::text = 'grace'
   AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia' AND g.revoked_at IS NULL);