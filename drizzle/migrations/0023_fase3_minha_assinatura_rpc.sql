CREATE OR REPLACE FUNCTION public.billing_v2_minha_assinatura(_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; conta jsonb; subs jsonb; faturas jsonb;
BEGIN
  IF NOT public.assinatura_pode_gerir(_company_id, 'consulta') THEN
    RAISE EXCEPTION 'Sem permissão para ver a assinatura desta empresa.' USING ERRCODE = '42501';
  END IF;
  SELECT billing_account_id INTO acc FROM billing_account_companies WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  IF acc IS NULL THEN RETURN jsonb_build_object('conta', null, 'assinaturas', '[]'::jsonb, 'faturas', '[]'::jsonb); END IF;

  SELECT jsonb_build_object('id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'documento_pagador', a.documento_pagador,
           'email_cobranca', a.email_cobranca, 'is_test', a.is_test,
           'empresas', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(c.name, c.trade_name)) ORDER BY c.name)
              FROM billing_account_companies bc JOIN companies c ON c.id = bc.company_id
             WHERE bc.billing_account_id = a.id AND bc.removed_at IS NULL), '[]'::jsonb))
    INTO conta FROM billing_accounts a WHERE a.id = acc;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'module'), '[]'::jsonb) INTO subs FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'module', s.module, 'status', s.status, 'ciclo', s.billing_cycle,
      'plano', jsonb_build_object('slug', p.slug, 'nome', p.name, 'tier', p.tier,
                 'mensal_cents', p.price_monthly_cents, 'anual_cents', p.price_annual_cents),
      'valor_ciclo_cents', public._billing_v2_sub_valor(s.id, p.slug, s.billing_cycle),
      'current_period_start', s.current_period_start, 'current_period_end', s.current_period_end,
      'next_charge_date', s.next_charge_date, 'trial_ends_at', s.trial_ends_at, 'grace_ends_at', s.grace_ends_at,
      'cancel_at_period_end', s.cancel_at_period_end, 'pending_plan_change', s.pending_plan_change,
      'is_exempt', s.is_exempt, 'pode_gerir', public._billing_v2_can_manage_sub(s.id),
      'limites', public.assinatura_limites(_company_id, s.module),
      'empresas', coalesce((SELECT jsonb_agg(coalesce(c.name, c.trade_name) ORDER BY c.name) FROM subscription_companies sc
          JOIN companies c ON c.id = sc.company_id WHERE sc.subscription_id = s.id AND sc.removed_at IS NULL), '[]'::jsonb),
      'adicionais', coalesce((SELECT jsonb_agg(jsonb_build_object('id', sa.id, 'code', pa.code, 'nome', pa.name,
            'quantidade', sa.quantity, 'preco_cents', sa.price_cents, 'cortesia', coalesce(sa.is_exempt,false), 'status', sa.status,
            'prorata_cents', sa.prorata_cents, 'prorata_billed_at', sa.prorata_billed_at, 'ends_at', sa.ends_at) ORDER BY pa.sort_order)
          FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
         WHERE sa.subscription_id = s.id AND sa.status <> 'canceled'), '[]'::jsonb),
      'adicionais_disponiveis', coalesce((SELECT jsonb_agg(jsonb_build_object('code', pa.code, 'nome', pa.name, 'preco_cents', pa.price_cents, 'max', pa.max_quantity) ORDER BY pa.sort_order)
          FROM plan_addons pa WHERE pa.module = s.module AND pa.is_active AND pa.code <> 'empresas'
           AND (pa.allowed_plan_slugs IS NULL OR p.slug = ANY(pa.allowed_plan_slugs))), '[]'::jsonb),
      'concessoes', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', g.tipo, 'percentual', g.percentual, 'motivo', g.motivo_texto,
            'starts_at', g.starts_at, 'ends_at', g.ends_at) ORDER BY g.starts_at)
          FROM subscription_grants g WHERE g.subscription_id = s.id AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at > now())), '[]'::jsonb),
      'proratas_pendentes', coalesce((SELECT jsonb_agg(jsonb_build_object('adicional', pa.name, 'valor_cents', sa.prorata_cents, 'desde', sa.created_at))
          FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
         WHERE sa.subscription_id = s.id AND coalesce(sa.prorata_cents,0) > 0 AND sa.prorata_billed_at IS NULL AND sa.status <> 'canceled'), '[]'::jsonb),
      'proxima_fatura', (SELECT jsonb_build_object('id', i.id, 'valor_cents', i.amount_cents, 'vencimento', i.due_date, 'status', i.status,
            'link', coalesce(i.external_payment_url, i.boleto_url),
            'itens', coalesce((SELECT jsonb_agg(jsonb_build_object('modulo', it.module, 'quantidade', it.quantity, 'total_cents', it.total_cents)) FROM invoice_items it WHERE it.invoice_id = i.id), '[]'::jsonb))
          FROM invoices i WHERE i.subscription_id = s.id AND i.status IN ('open','pending','overdue') ORDER BY i.due_date LIMIT 1),
      'historico', coalesce((SELECT jsonb_agg(jsonb_build_object('tipo', e.tipo_evento, 'quando', e.created_at, 'payload', e.payload) ORDER BY e.created_at DESC)
          FROM (SELECT * FROM subscription_events e2 WHERE e2.subscription_id = s.id ORDER BY e2.created_at DESC LIMIT 30) e), '[]'::jsonb)
    ) x
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
   WHERE s.billing_account_id = acc AND s.status::text NOT IN ('canceled','expired')
  ) t;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'modulo', s.module, 'valor_cents', i.amount_cents, 'vencimento', i.due_date,
           'pago_em', i.paid_at, 'status', i.status, 'forma', i.payment_method, 'link', coalesce(i.external_payment_url, i.boleto_url),
           'nf_numero', i.fiscal_invoice_number, 'nf_status', i.fiscal_invoice_status, 'nf_pdf', i.fiscal_invoice_pdf_url) ORDER BY i.due_date DESC), '[]'::jsonb)
    INTO faturas FROM (SELECT * FROM invoices WHERE billing_account_id = acc ORDER BY due_date DESC LIMIT 36) i
    LEFT JOIN subscriptions s ON s.id = i.subscription_id;

  RETURN jsonb_build_object('conta', conta, 'assinaturas', subs, 'faturas', faturas);
END $$;

CREATE OR REPLACE FUNCTION public.billing_v2_addon_quote(_subscription_id uuid, _code text, _qtd int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; p record; emp int; ads jsonb; q jsonb; atual int; novo int; frac numeric := 0; cort boolean;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  IF _qtd IS NULL OR _qtd < 1 OR _qtd > 500 THEN RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Quantidade inválida')); END IF;
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id;
  SELECT * INTO p FROM plans WHERE id = s.plan_id;
  SELECT count(*) INTO emp FROM subscription_companies WHERE subscription_id = s.id AND removed_at IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', code, 'qtd', qtd)), '[]'::jsonb) INTO ads FROM (
    SELECT pa.code, sum(sa.quantity)::int + CASE WHEN pa.code = _code THEN _qtd ELSE 0 END qtd
      FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
     WHERE sa.subscription_id = s.id AND sa.status <> 'canceled' AND NOT coalesce(sa.is_exempt,false) AND pa.code <> 'empresas'
     GROUP BY pa.code
    UNION ALL SELECT _code, _qtd WHERE NOT EXISTS (SELECT 1 FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
     WHERE sa.subscription_id = s.id AND sa.status <> 'canceled' AND NOT coalesce(sa.is_exempt,false) AND pa.code = _code)) z;
  q := public.billing_v2_quote(s.billing_account_id,
        jsonb_build_object('modulos', jsonb_build_array(jsonb_build_object('plano', p.slug, 'empresas', greatest(emp,1), 'adicionais', ads))),
        CASE WHEN s.billing_cycle = 'anual' THEN 'yearly' ELSE 'monthly' END);
  IF NOT coalesce((q->>'ok')::boolean, false) THEN RETURN jsonb_build_object('ok', false, 'erros', q->'erros'); END IF;
  atual := public._billing_v2_sub_valor(s.id, p.slug, s.billing_cycle);
  novo := (q->>'total_ciclo_cents')::int;
  IF s.current_period_end > now() AND s.current_period_end > s.current_period_start THEN
    frac := extract(epoch FROM s.current_period_end - now()) / extract(epoch FROM s.current_period_end - s.current_period_start);
  END IF;
  cort := s.is_exempt OR EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'cortesia_total'
            AND g.revoked_at IS NULL AND g.starts_at <= now() AND (g.ends_at IS NULL OR g.ends_at > now()));
  RETURN jsonb_build_object('ok', true, 'valor_ciclo_atual_cents', atual, 'valor_ciclo_novo_cents', novo,
    'prorata_cents', CASE WHEN cort THEN 0 ELSE greatest(round((novo - coalesce(atual,0)) * frac),0)::int END,
    'fracao_restante', round(frac, 4), 'ciclo', s.billing_cycle, 'cortesia', cort,
    'cobranca', CASE WHEN cort THEN 'nenhuma' WHEN s.billing_cycle = 'anual' OR round((novo - coalesce(atual,0)) * frac) >= 500 THEN 'imediata' ELSE 'proxima_mensalidade' END);
END $$;

REVOKE ALL ON FUNCTION public.billing_v2_minha_assinatura(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.billing_v2_addon_quote(uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_minha_assinatura(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.billing_v2_addon_quote(uuid, text, int) TO authenticated, service_role;