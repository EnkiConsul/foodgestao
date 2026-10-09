ALTER TABLE public.billing_accounts
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_marked_by uuid,
  ADD COLUMN IF NOT EXISTS internal_marked_at timestamptz,
  ADD COLUMN IF NOT EXISTS internal_reason text;

CREATE OR REPLACE FUNCTION public._admin_c360_mrr(_sub uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; v int; anual boolean;
BEGIN
  SELECT su.*, p.slug, p.price_monthly_cents, p.price_annual_cents INTO s
    FROM subscriptions su JOIN plans p ON p.id = su.plan_id WHERE su.id = _sub;
  IF NOT FOUND THEN RETURN 0; END IF;
  anual := coalesce(s.billing_cycle,'') IN ('anual','yearly','annual');
  BEGIN
    v := public._billing_v2_sub_valor(_sub, s.slug, CASE WHEN anual THEN 'anual' ELSE 'mensal' END);
  EXCEPTION WHEN OTHERS THEN v := NULL; END;
  IF v IS NULL THEN v := CASE WHEN anual THEN coalesce(s.price_annual_cents,0) ELSE coalesce(s.price_monthly_cents,0) END; END IF;
  RETURN CASE WHEN anual THEN round(v / 12.0)::int ELSE v END;
END $$;
REVOKE ALL ON FUNCTION public._admin_c360_mrr(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_c360_mrr(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_cliente360_lista()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso restrito ao super admin.'; END IF;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'nome'), '[]'::jsonb) INTO r FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'nome', a.nome, 'tipo', a.tipo, 'documento', a.documento_pagador,
      'email_cobranca', a.email_cobranca, 'created_at', a.created_at,
      'is_internal', a.is_internal, 'internal_reason', a.internal_reason, 'internal_marked_at', a.internal_marked_at,
      'titular', (SELECT jsonb_build_object('user_id', p.user_id, 'nome', p.full_name) FROM profiles p WHERE p.user_id = a.titular_user_id),
      'empresas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(c.name, c.trade_name), 'fantasia', c.trade_name, 'cnpj', c.cnpj, 'desde', b.created_at) ORDER BY c.name)
          FROM billing_account_companies b JOIN companies c ON c.id = b.company_id
          WHERE b.billing_account_id = a.id AND b.removed_at IS NULL), '[]'::jsonb),
      'admins', coalesce((SELECT jsonb_agg(DISTINCT jsonb_build_object('user_id', m.user_id, 'nome', p.full_name, 'role', m.role))
          FROM billing_account_companies b JOIN company_members m ON m.company_id = b.company_id
          LEFT JOIN profiles p ON p.user_id = m.user_id
          WHERE b.billing_account_id = a.id AND b.removed_at IS NULL AND m.user_id <> a.titular_user_id
            AND NOT EXISTS (SELECT 1 FROM dp_colaboradores d WHERE d.user_id = m.user_id)), '[]'::jsonb),
      'colaboradores_ativos', (SELECT count(*) FROM dp_colaboradores d JOIN billing_account_companies b ON b.company_id = d.company_id
          AND b.billing_account_id = a.id AND b.removed_at IS NULL
          WHERE d.deleted_at IS NULL AND coalesce(d.ativo, true) AND d.data_desligamento IS NULL),
      'colaboradores_portal', (SELECT count(DISTINCT d.user_id) FROM dp_colaboradores d JOIN billing_account_companies b ON b.company_id = d.company_id
          AND b.billing_account_id = a.id AND b.removed_at IS NULL
          WHERE d.user_id IS NOT NULL AND d.deleted_at IS NULL),
      'assinaturas', coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id', s.id, 'module', coalesce(s.module, pl.module), 'plano', pl.name, 'plan_id', s.plan_id, 'status', s.status,
            'billing_cycle', s.billing_cycle, 'is_exempt', s.is_exempt, 'exempt_until', s.exempt_until,
            'grace_ends_at', s.grace_ends_at, 'current_period_end', s.current_period_end, 'created_at', s.created_at,
            'mrr_cents', CASE WHEN s.status::text IN ('canceled','expired') THEN 0 ELSE public._admin_c360_mrr(s.id) END,
            'colab_limite', (SELECT l.limite FROM public._billing_v2_limits(s.id) l WHERE l.recurso = 'colaboradores'),
            'colab_uso', (SELECT l.uso FROM public._billing_v2_limits(s.id) l WHERE l.recurso = 'colaboradores'),
            'grant_ativo', (SELECT jsonb_build_object('tipo', g.tipo, 'motivo', g.motivo_codigo, 'ends_at', g.ends_at)
                FROM subscription_grants g WHERE g.subscription_id = s.id AND g.revoked_at IS NULL
                ORDER BY g.granted_at DESC LIMIT 1)) ORDER BY s.created_at DESC)
          FROM subscriptions s JOIN plans pl ON pl.id = s.plan_id WHERE s.billing_account_id = a.id), '[]'::jsonb),
      'proxima_fatura', (SELECT jsonb_build_object('id', i.id, 'due_date', i.due_date, 'amount_cents', i.amount_cents, 'status', i.status, 'url', i.external_payment_url)
          FROM invoices i WHERE i.billing_account_id = a.id AND i.status::text IN ('open','overdue','draft') ORDER BY i.due_date LIMIT 1),
      'inadimplente', EXISTS (SELECT 1 FROM invoices i WHERE i.billing_account_id = a.id AND (i.status::text = 'overdue' OR (i.status::text = 'open' AND i.due_date < current_date)))
    ) x
    FROM billing_accounts a
    WHERE a.asaas_env = 'production' AND NOT a.is_test
      AND NOT EXISTS (SELECT 1 FROM profiles p0 WHERE false)
  ) t;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_cliente360_lista() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente360_lista() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cliente360_detalhe(_account uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso restrito ao super admin.'; END IF;
  RETURN jsonb_build_object(
    'concessoes', coalesce((SELECT jsonb_agg(to_jsonb(g) || jsonb_build_object('module', s.module) ORDER BY g.granted_at DESC)
        FROM subscription_grants g JOIN subscriptions s ON s.id = g.subscription_id WHERE s.billing_account_id = _account), '[]'::jsonb),
    'faturas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', i.id, 'due_date', i.due_date, 'amount_cents', i.amount_cents, 'status', i.status,
        'paid_at', i.paid_at, 'payment_method', i.payment_method, 'url', i.external_payment_url) ORDER BY i.due_date DESC)
        FROM invoices i WHERE i.billing_account_id = _account), '[]'::jsonb),
    'eventos', coalesce((SELECT jsonb_agg(e ORDER BY e->>'created_at' DESC) FROM (
        SELECT jsonb_build_object('origem','assinatura','module', s.module, 'tipo', se.tipo_evento, 'payload', se.payload,
          'created_at', se.created_at, 'ator', (SELECT full_name FROM profiles WHERE user_id = se.actor_id)) e
          FROM subscription_events se JOIN subscriptions s ON s.id = se.subscription_id WHERE s.billing_account_id = _account
        UNION ALL
        SELECT jsonb_build_object('origem','conta','module', null, 'tipo', be.tipo_evento, 'payload', be.payload,
          'created_at', be.created_at, 'ator', (SELECT full_name FROM profiles WHERE user_id = be.actor_id))
          FROM billing_account_events be WHERE be.billing_account_id = _account
        ORDER BY 1 LIMIT 500) q), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_cliente360_detalhe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente360_detalhe(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cliente360_marcar_interna(_account uuid, _interna boolean, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_ant boolean; s record;
BEGIN
  IF NOT public.is_super_admin(v_uid) THEN RAISE EXCEPTION 'Acesso restrito ao super admin.'; END IF;
  IF length(trim(coalesce(_motivo,''))) < 10 THEN RAISE EXCEPTION 'Informe o motivo (mínimo 10 caracteres).'; END IF;
  SELECT is_internal INTO v_ant FROM billing_accounts WHERE id = _account FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_ant = _interna THEN RAISE EXCEPTION 'A conta já está nesse estado.'; END IF;
  UPDATE billing_accounts SET is_internal = _interna,
    internal_marked_by = v_uid, internal_marked_at = now(), internal_reason = trim(_motivo), updated_at = now()
   WHERE id = _account;
  INSERT INTO billing_account_events(billing_account_id, tipo_evento, payload, actor_id)
  VALUES (_account, CASE WHEN _interna THEN 'conta_marcada_interna' ELSE 'conta_desmarcada_interna' END,
          jsonb_build_object('motivo', trim(_motivo)), v_uid);
  FOR s IN SELECT id FROM subscriptions WHERE billing_account_id = _account LOOP
    INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
    VALUES (s.id, CASE WHEN _interna THEN 'conta_marcada_interna' ELSE 'conta_desmarcada_interna' END,
            jsonb_build_object('billing_account_id', _account, 'motivo', trim(_motivo)), v_uid);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.admin_cliente360_marcar_interna(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente360_marcar_interna(uuid, boolean, text) TO authenticated, service_role;