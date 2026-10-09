-- Itens de cotação de uma assinatura (empresas cobertas + adicionais ativos não isentos) para um plano/ciclo.
CREATE OR REPLACE FUNCTION public._billing_v2_sub_valor(_subscription_id uuid, _plan_slug text, _ciclo text)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; emp int; ads jsonb; q jsonb;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id;
  SELECT count(*) INTO emp FROM subscription_companies WHERE subscription_id = _subscription_id AND removed_at IS NULL;
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', pa.code, 'qtd', sa.quantity)), '[]'::jsonb) INTO ads
    FROM subscription_addons sa JOIN plan_addons pa ON pa.id = sa.addon_id
   WHERE sa.subscription_id = _subscription_id AND sa.status <> 'canceled' AND NOT coalesce(sa.is_exempt,false) AND pa.code <> 'empresas';
  q := public.billing_v2_quote(s.billing_account_id,
        jsonb_build_object('modulos', jsonb_build_array(jsonb_build_object('plano', _plan_slug, 'empresas', greatest(emp,1), 'adicionais', ads))),
        CASE WHEN _ciclo = 'anual' THEN 'yearly' ELSE 'monthly' END);
  IF NOT coalesce((q->>'ok')::boolean, false) THEN RETURN NULL; END IF;
  RETURN (q->>'total_ciclo_cents')::int;
END $$;
REVOKE ALL ON FUNCTION public._billing_v2_sub_valor(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Cotação de troca: crédito e cobrança consideram plano + adicionais (ciclo atual e novo).
CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_quote(_subscription_id uuid, _plan_slug text, _billing_cycle text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; pa record; pn record; l record; nl record;
  ciclo_atual text; ciclo_novo text := _billing_cycle;
  val_atual int; val_novo int; frac numeric := 0; credito int := 0; cobrar int := 0;
  tipo text; efetivo timestamptz; impeditivos jsonb := '[]'::jsonb; novo_lim int; cortesia boolean;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  IF ciclo_novo NOT IN ('mensal','anual') THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Ciclo inválido'));
  END IF;
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada.'; END IF;
  IF s.status::text IN ('canceled','expired') THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Assinatura encerrada'));
  END IF;
  SELECT * INTO pa FROM plans WHERE id = s.plan_id;
  SELECT * INTO pn FROM plans WHERE slug = _plan_slug AND is_active;
  IF pn.id IS NULL OR pn.is_enterprise THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Plano indisponível para contratação direta'));
  END IF;
  IF pn.module <> coalesce(s.module, pa.module) THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('O novo plano é de outro módulo'));
  END IF;
  ciclo_atual := coalesce(s.billing_cycle, 'mensal');
  cortesia := coalesce(s.is_exempt,false) OR EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id
      AND g.tipo = 'cortesia_total' AND g.revoked_at IS NULL AND g.starts_at <= now() AND (g.ends_at IS NULL OR g.ends_at > now()));
  val_atual := coalesce(public._billing_v2_sub_valor(s.id, pa.slug, ciclo_atual),
                CASE WHEN ciclo_atual = 'anual' THEN pa.price_annual_cents ELSE pa.price_monthly_cents END);
  val_novo  := public._billing_v2_sub_valor(s.id, pn.slug, ciclo_novo);

  IF s.status::text = 'active' AND NOT cortesia
     AND s.current_period_start IS NOT NULL AND s.current_period_end > now()
     AND s.current_period_end > s.current_period_start THEN
    frac := extract(epoch FROM (s.current_period_end - greatest(now(), s.current_period_start)))
          / extract(epoch FROM (s.current_period_end - s.current_period_start));
  END IF;

  IF pn.id = pa.id AND ciclo_novo = ciclo_atual THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Nenhuma alteração'));
  ELSIF ciclo_atual = 'mensal' AND ciclo_novo = 'anual' AND pn.price_monthly_cents >= pa.price_monthly_cents THEN
    tipo := 'troca_ciclo_anual';
    IF val_novo IS NULL THEN RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Plano novo não comporta o uso atual')); END IF;
    credito := round(val_atual * frac);
    cobrar := CASE WHEN cortesia THEN 0 ELSE greatest(val_novo - credito, 0) END;
    efetivo := now();
  ELSIF ciclo_novo = ciclo_atual AND pn.price_monthly_cents > pa.price_monthly_cents THEN
    tipo := 'upgrade';
    IF val_novo IS NULL THEN RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Plano novo não comporta o uso atual')); END IF;
    credito := round(val_atual * frac);
    cobrar := CASE WHEN cortesia THEN 0 ELSE greatest(round(val_novo * frac) - credito, 0) END;
    efetivo := now();
  ELSE
    tipo := CASE WHEN ciclo_atual = 'anual' AND ciclo_novo = 'mensal' THEN 'troca_ciclo_mensal' ELSE 'downgrade' END;
    efetivo := coalesce(s.current_period_end, now());
    FOR l IN SELECT * FROM public._billing_v2_limits(_subscription_id) LOOP
      SELECT * INTO nl FROM plan_limits WHERE plan_id = pn.id AND recurso = l.recurso;
      IF nl.recurso IS NULL OR nl.incluido IS NULL THEN CONTINUE; END IF;
      novo_lim := coalesce(l.override, nl.incluido + CASE WHEN nl.permite_adicional THEN coalesce(l.adicional,0) ELSE 0 END);
      IF coalesce(l.uso,0) > novo_lim THEN
        impeditivos := impeditivos || jsonb_build_object('recurso', l.recurso, 'uso', l.uso, 'limite_novo', novo_lim,
          'mensagem', format('Uso de %s (%s) acima do limite do novo plano (%s)', l.recurso, l.uso, novo_lim));
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(impeditivos) = 0, 'tipo', tipo,
    'plano_atual', pa.slug, 'ciclo_atual', ciclo_atual, 'plano_novo', pn.slug, 'ciclo_novo', ciclo_novo,
    'valor_ciclo_atual_cents', val_atual, 'valor_ciclo_novo_cents', val_novo, 'cortesia', cortesia,
    'fracao_restante', round(frac, 6), 'credito_cents', credito, 'cobrar_agora_cents', cobrar,
    'imediato', tipo IN ('upgrade','troca_ciclo_anual'), 'efetivo_em', efetivo,
    'impeditivos', impeditivos, 'asaas_env', s.asaas_env);
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_plan_change_quote(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_plan_change_quote(uuid, text, text) TO authenticated, service_role;

-- Taxas do cartão do Asaas repassadas ao cliente a partir de 2x (editáveis pelo super admin).
INSERT INTO public.system_parameters(key, value, description)
VALUES ('billing_v2_cartao_taxas',
  '{"fixo_cents":49,"faixas":[{"ate":6,"pct":3.49},{"ate":12,"pct":3.99}]}'::jsonb,
  'Taxas do cartão do Asaas repassadas ao cliente no anual parcelado (2x a 12x). 1x sem repasse.')
ON CONFLICT (key) DO NOTHING;

-- Opções de parcelamento: valor líquido integral para a Aveto; juros repassados a partir de 2x.
CREATE OR REPLACE FUNCTION public.billing_v2_parcelamento(_valor_cents int)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE cfg jsonb; n int; pct numeric; fixo int; total int; out jsonb := '[]'::jsonb;
BEGIN
  IF _valor_cents IS NULL OR _valor_cents <= 0 THEN RETURN out; END IF;
  SELECT value INTO cfg FROM system_parameters WHERE key = 'billing_v2_cartao_taxas';
  fixo := coalesce((cfg->>'fixo_cents')::int, 49);
  FOR n IN 1..12 LOOP
    IF n = 1 THEN total := _valor_cents;
    ELSE
      SELECT (f->>'pct')::numeric INTO pct FROM jsonb_array_elements(cfg->'faixas') f
       WHERE (f->>'ate')::int >= n ORDER BY (f->>'ate')::int LIMIT 1;
      total := ceil((_valor_cents + fixo) / (1 - coalesce(pct,3.99)/100.0));
      total := ceil(total::numeric / n) * n; -- parcelas iguais
    END IF;
    out := out || jsonb_build_object('parcelas', n, 'valor_parcela_cents', total / n, 'total_cents', total,
      'juros_cents', total - _valor_cents, 'com_juros', n > 1);
  END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION public.billing_v2_parcelamento(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_parcelamento(int) TO authenticated, service_role;