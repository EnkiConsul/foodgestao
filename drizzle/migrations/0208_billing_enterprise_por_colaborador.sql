CREATE OR REPLACE FUNCTION public.billing_v2_quote(_billing_account_id uuid, _itens jsonb, _billing_cycle text, _coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m jsonb; a jsonb; p record; lim record; ad record; cp record;
  itens jsonb := '[]'::jsonb; erros jsonb := '[]'::jsonb; sugestoes jsonb := '[]'::jsonb;
  anual boolean := (_billing_cycle = 'yearly');
  meses int := CASE WHEN _billing_cycle = 'yearly' THEN 12 ELSE 1 END;
  plano_cents int; add_cents int; total int := 0; desconto_cupom int := 0; total_mensal_mod int;
  emp int; extra int; up record;
  por_colab boolean; colab_extra int; colab_total int;
BEGIN
  IF _billing_cycle NOT IN ('monthly','yearly') THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Ciclo inválido'));
  END IF;
  IF jsonb_typeof(_itens->'modulos') <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Nenhum módulo informado'));
  END IF;

  FOR m IN SELECT * FROM jsonb_array_elements(_itens->'modulos') LOOP
    SELECT * INTO p FROM plans WHERE slug = m->>'plano' AND is_active;
    IF NOT FOUND OR p.is_enterprise THEN
      erros := erros || to_jsonb(format('Plano %s indisponível para contratação direta', m->>'plano'));
      CONTINUE;
    END IF;
    plano_cents := CASE WHEN anual THEN p.price_annual_cents ELSE p.price_monthly_cents END;
    itens := itens || jsonb_build_object('tipo','plano','modulo',p.module,'codigo',p.slug,'descricao',p.name,
      'quantidade',1,'unitario_cents',plano_cents,'desconto_cents',
      CASE WHEN anual THEN p.price_monthly_cents*12 - p.price_annual_cents ELSE 0 END,'total_cents',plano_cents);
    total := total + plano_cents;
    total_mensal_mod := p.price_monthly_cents;
    -- plano por colaborador ativo (Enterprise): base inclui a franquia mínima; o que passar é apurado no mês
    por_colab := coalesce(p.features ? 'price_per_collaborator_cents', false);
    colab_extra := 0;

    -- empresas cobertas
    emp := greatest(coalesce((m->>'empresas')::int, 1), 1);
    SELECT * INTO lim FROM plan_limits WHERE plan_id = p.id AND recurso = 'empresas';
    IF NOT FOUND AND por_colab THEN
      extra := 0; -- plano por colaborador: empresas sem limite
    ELSE
      extra := greatest(emp - coalesce(lim.incluido, 1), 0);
    END IF;
    IF extra > 0 AND NOT coalesce(lim.permite_adicional, false) THEN
      erros := erros || to_jsonb(format('%s não permite empresa adicional', p.name));
    ELSIF extra > 0 AND lim.max_adicional IS NOT NULL AND extra > lim.max_adicional THEN
      erros := erros || to_jsonb(format('%s permite no máximo %s empresa(s) adicional(is)', p.name, lim.max_adicional));
    END IF;
    IF extra > 0 THEN
      m := jsonb_set(m, '{adicionais}', coalesce(m->'adicionais','[]'::jsonb) || jsonb_build_array(jsonb_build_object('code','empresas','qtd',extra)));
    END IF;

    FOR a IN SELECT * FROM jsonb_array_elements(coalesce(m->'adicionais','[]'::jsonb)) LOOP
      SELECT * INTO ad FROM plan_addons WHERE module = p.module AND code = a->>'code' AND is_active;
      IF NOT FOUND THEN erros := erros || to_jsonb(format('Adicional %s inexistente', a->>'code')); CONTINUE; END IF;
      IF ad.allowed_plan_slugs IS NOT NULL AND NOT (p.slug = ANY(ad.allowed_plan_slugs)) THEN
        erros := erros || to_jsonb(format('%s não disponível no %s', ad.name, p.name)); CONTINUE;
      END IF;
      IF coalesce((a->>'qtd')::int,0) <= 0 THEN CONTINUE; END IF;
      IF ad.code = 'colaboradores' THEN
        colab_extra := colab_extra + (a->>'qtd')::int;
        -- plano por colaborador não vende adicional de colaborador: o excedente é apurado no mês
        IF por_colab THEN CONTINUE; END IF;
      END IF;
      IF ad.recurso = 'unidades' THEN
        SELECT * INTO lim FROM plan_limits WHERE plan_id = p.id AND recurso = 'unidades';
        IF FOUND AND NOT lim.permite_adicional THEN
          erros := erros || to_jsonb(format('%s não permite unidade adicional', p.name)); CONTINUE;
        END IF;
      END IF;
      -- adicional anual: 12 meses com o mesmo desconto proporcional do plano
      add_cents := CASE WHEN anual THEN round(ad.price_cents * 12 * (1 - coalesce(p.annual_discount_pct,0)/100.0))::int ELSE ad.price_cents END;
      itens := itens || jsonb_build_object('tipo','adicional','modulo',p.module,'codigo',ad.code,'descricao',ad.name,
        'quantidade',(a->>'qtd')::int,'unitario_cents',add_cents,
        'desconto_cents', CASE WHEN anual THEN (ad.price_cents*12 - add_cents)*(a->>'qtd')::int ELSE 0 END,
        'total_cents',add_cents*(a->>'qtd')::int);
      total := total + add_cents*(a->>'qtd')::int;
      total_mensal_mod := total_mensal_mod + ad.price_cents*(a->>'qtd')::int;
    END LOOP;

    -- sugestão de upgrade: plano superior do mesmo módulo mais barato que plano + adicionais
    SELECT coalesce(max(incluido),0) + colab_extra INTO colab_total FROM plan_limits WHERE plan_id = p.id AND recurso = 'colaboradores';
    FOR up IN SELECT x.slug, x.name, x.price_monthly_cents FROM (
        SELECT pp.slug, pp.name, pp.price_monthly_cents
             + CASE WHEN pp.features ? 'price_per_collaborator_cents'
                    THEN greatest(colab_total - coalesce(plc.incluido, 0), 0) * (pp.features->>'price_per_collaborator_cents')::int
                    ELSE 0 END AS price_monthly_cents
          FROM plans pp LEFT JOIN plan_limits plc ON plc.plan_id = pp.id AND plc.recurso = 'colaboradores'
         WHERE pp.module = p.module AND pp.is_active AND NOT pp.is_enterprise AND pp.sort_order > p.sort_order) x
      WHERE x.price_monthly_cents < total_mensal_mod ORDER BY x.price_monthly_cents LIMIT 1 LOOP
      sugestoes := sugestoes || jsonb_build_object('de',p.slug,'para',up.slug,'nome',up.name,
        'mensal_atual_cents',total_mensal_mod,'mensal_sugerido_cents',up.price_monthly_cents,
        'mensagem',format('O %s sai mais barato (R$ %s/mês) que o plano atual com adicionais (R$ %s/mês).',
          up.name, to_char(up.price_monthly_cents/100.0,'FM999G990D00'), to_char(total_mensal_mod/100.0,'FM999G990D00')));
    END LOOP;
  END LOOP;

  -- cupom: só no mensal e só sobre o valor dos planos
  IF nullif(trim(_coupon_code),'') IS NOT NULL THEN
    IF anual THEN
      erros := erros || to_jsonb('Cupom não acumula com o desconto do plano anual'::text);
    ELSE
      SELECT * INTO cp FROM coupons WHERE upper(code) = upper(trim(_coupon_code)) AND is_active
        AND (valid_from IS NULL OR valid_from <= now()) AND (valid_until IS NULL OR valid_until >= now())
        AND (max_redemptions IS NULL OR times_redeemed < max_redemptions);
      IF NOT FOUND THEN
        erros := erros || to_jsonb('Cupom inválido ou expirado'::text);
      ELSE
        SELECT coalesce(sum((i->>'total_cents')::int),0) INTO plano_cents FROM jsonb_array_elements(itens) i WHERE i->>'tipo'='plano';
        desconto_cupom := least(plano_cents, CASE WHEN cp.discount_type::text = 'percent'
          THEN round(plano_cents * cp.discount_value/100.0)::int ELSE round(cp.discount_value*100)::int END);
        itens := itens || jsonb_build_object('tipo','cupom','codigo',cp.code,'descricao','Cupom '||cp.code,
          'quantidade',1,'unitario_cents',-desconto_cupom,'desconto_cents',desconto_cupom,'total_cents',-desconto_cupom);
        total := total - desconto_cupom;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', jsonb_array_length(erros) = 0, 'ciclo', _billing_cycle, 'meses', meses,
    'itens', itens, 'erros', erros, 'sugestoes_upgrade', sugestoes,
    'total_ciclo_cents', greatest(total,0), 'total_agora_cents', greatest(total,0),
    'billing_account_id', _billing_account_id);
END $function$;

CREATE OR REPLACE FUNCTION public.billing_v2_apply_change(_subscription_id uuid, _plan_slug text, _ciclo text, _origem text, _actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; pn uuid; anual_novo boolean := (_ciclo = 'anual'); muda_ciclo boolean; por_colab boolean; encerrados int := 0;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Assinatura não encontrada'; END IF;
  SELECT id, coalesce(features ? 'price_per_collaborator_cents', false) INTO pn, por_colab FROM plans WHERE slug = _plan_slug AND is_active;
  IF pn IS NULL THEN RAISE EXCEPTION 'Plano inexistente'; END IF;
  muda_ciclo := coalesce(s.billing_cycle,'mensal') <> _ciclo;
  UPDATE subscriptions SET plan_id = pn, billing_cycle = _ciclo, pending_plan_change = NULL,
    current_period_start = CASE WHEN _origem = 'imediata' AND muda_ciclo THEN now() ELSE current_period_start END,
    current_period_end = CASE
      WHEN _origem = 'imediata' AND muda_ciclo THEN now() + interval '1 year'
      WHEN _origem = 'agendada' THEN greatest(coalesce(current_period_end, now()), now())
             + CASE WHEN anual_novo THEN interval '1 year' ELSE interval '1 month' END
      ELSE current_period_end END,
    updated_at = now()
  WHERE id = _subscription_id;
  -- plano por colaborador ativo: adicionais de colaborador deixam de existir (o excedente é apurado no mês)
  IF por_colab THEN
    UPDATE subscription_addons sa SET status = 'canceled', ends_at = now(),
           notes = concat_ws(' · ', nullif(sa.notes, ''), 'encerrado: plano cobrado por colaborador ativo')
      FROM plan_addons pa
     WHERE pa.id = sa.addon_id AND pa.code = 'colaboradores' AND sa.subscription_id = _subscription_id AND sa.status = 'active';
    GET DIAGNOSTICS encerrados = ROW_COUNT;
  END IF;
  INSERT INTO subscription_events(subscription_id, tipo_evento, payload, actor_id)
  VALUES (_subscription_id, 'troca_aplicada', jsonb_build_object('plano', _plan_slug, 'ciclo', _ciclo, 'origem', _origem,
          'adicionais_colaborador_encerrados', encerrados), COALESCE(_actor, public.billing_v2_actor()));
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.billing_v2_addon_quote(_subscription_id uuid, _code text, _qtd integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s record; p record; emp int; ads jsonb; q jsonb; atual int; novo int; frac numeric := 0; cort boolean;
BEGIN
  IF NOT public._billing_v2_can_manage_sub(_subscription_id) THEN
    RAISE EXCEPTION 'Sem permissão para alterar esta assinatura.' USING ERRCODE = '42501';
  END IF;
  IF _qtd IS NULL OR _qtd < 1 OR _qtd > 500 THEN RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array('Quantidade inválida')); END IF;
  SELECT * INTO s FROM subscriptions WHERE id = _subscription_id;
  SELECT * INTO p FROM plans WHERE id = s.plan_id;
  IF _code = 'colaboradores' AND coalesce(p.features ? 'price_per_collaborator_cents', false) THEN
    RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array(format('O %s já cobra por colaborador ativo: não é preciso contratar adicional.', p.name)));
  END IF;
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
END $function$;