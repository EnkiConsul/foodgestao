CREATE TABLE IF NOT EXISTS public.billing_v2_backfill_snapshot (
  id bigserial PRIMARY KEY, etapa text NOT NULL, company_id uuid, acesso jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.billing_v2_backfill_snapshot TO service_role;
GRANT USAGE ON SEQUENCE public.billing_v2_backfill_snapshot_id_seq TO service_role;
GRANT SELECT ON public.billing_v2_backfill_snapshot TO authenticated;
ALTER TABLE public.billing_v2_backfill_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin le snapshot" ON public.billing_v2_backfill_snapshot FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.plan_rule_check(_subscription_id uuid, _recurso text, _qtd_desejada integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Menor plano público do mesmo módulo que comporta a quantidade desejada; senão Enterprise.
  SELECT p.slug, p.name, p.price_monthly_cents INTO v_up
    FROM plans p JOIN plan_limits pl ON pl.plan_id = p.id AND pl.recurso = _recurso
   WHERE p.module = s.mod AND p.is_active AND NOT COALESCE(p.is_enterprise,false) AND p.price_monthly_cents > s.preco
     AND pl.incluido >= _qtd_desejada
   ORDER BY p.price_monthly_cents LIMIT 1;
  IF v_up.slug IS NULL THEN
    SELECT p.slug, p.name, NULL::int AS price_monthly_cents INTO v_up FROM plans p
     WHERE p.module = s.mod AND p.is_active AND (COALESCE(p.is_enterprise,false) OR p.tier = 'enterprise')
     ORDER BY p.sort_order LIMIT 1;
  END IF;

  IF v_custo IS NOT NULL THEN
    RETURN jsonb_build_object('permitido', true, 'motivo', 'adicional',
      'opcoes', CASE WHEN _recurso = 'empresas' THEN '["adicional","upgrade","conta_separada"]'::jsonb ELSE '["adicional","upgrade"]'::jsonb END,
      'limite', l.limite, 'uso', l.uso, 'quantidade_adicional', v_extra, 'addon_id', v_addon.id,
      'custo_mensal_cents', v_custo, 'prorata_cents', v_prorata, 'inclui', v_addon.inclui,
      'custo_total_mensal_cents', v_atual + v_custo,
      'sugestao_upgrade', CASE WHEN v_up.slug IS NOT NULL THEN jsonb_build_object('plano', v_up.slug, 'nome', v_up.name,
          'preco_mensal_cents', v_up.price_monthly_cents,
          'economia_mensal_cents', CASE WHEN v_up.price_monthly_cents IS NOT NULL THEN GREATEST(0, v_atual + v_custo - v_up.price_monthly_cents) END,
          'enterprise', v_up.price_monthly_cents IS NULL,
          'mensagem', CASE WHEN v_up.price_monthly_cents IS NULL THEN 'Fale com nosso especialista' END) END);
  END IF;
  RETURN jsonb_build_object('permitido', false,
    'motivo', CASE WHEN NOT l.permite_adicional THEN 'adicional_proibido_pelo_plano' ELSE 'teto_de_adicionais_atingido' END,
    'opcoes', CASE WHEN _recurso = 'empresas' THEN '["upgrade","conta_separada"]'::jsonb ELSE '["upgrade"]'::jsonb END,
    'limite', l.limite, 'uso', l.uso,
    'sugestao_upgrade', CASE WHEN v_up.slug IS NOT NULL THEN jsonb_build_object('plano', v_up.slug, 'nome', v_up.name,
       'preco_mensal_cents', v_up.price_monthly_cents, 'enterprise', v_up.price_monthly_cents IS NULL,
       'mensagem', CASE WHEN v_up.price_monthly_cents IS NULL THEN 'Fale com nosso especialista' END) END);
END $function$;

CREATE OR REPLACE FUNCTION public.billing_v2_reconciliation()
 RETURNS TABLE(tipo text, subscription_id uuid, company_id uuid, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  SELECT 'empresa_sem_cobertura_no_modulo', s.id, b.company_id, 'INFORMATIVO: ' || s.module FROM subscriptions s
    JOIN billing_account_companies b ON b.billing_account_id = s.billing_account_id AND b.removed_at IS NULL
   WHERE s.status::text NOT IN ('canceled','expired')
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.company_id = b.company_id AND sc.module = s.module AND sc.removed_at IS NULL)
  UNION ALL
  SELECT 'assinatura_ativa_sem_cobertura', s.id, s.company_id, 'TRAVANTE: assinatura ' || s.module || ' sem nenhuma empresa coberta'
    FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired')
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.subscription_id = s.id AND sc.removed_at IS NULL)
     AND NOT (s.status::text = 'trialing' AND NOT EXISTS (SELECT 1 FROM billing_account_companies b
              WHERE b.billing_account_id = s.billing_account_id AND b.removed_at IS NULL))
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'e-mail ' || k FROM (SELECT lower(email) k FROM trial_usage WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CPF ' || k FROM (SELECT documento_titular k FROM trial_usage WHERE documento_titular IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CNPJ ' || k FROM (SELECT cnpj_empresa k FROM trial_usage WHERE cnpj_empresa IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'plano_fora_do_catalogo', s.id, s.company_id, p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id
   WHERE s.status::text NOT IN ('canceled','expired') AND NOT p.is_active;
END $function$;