INSERT INTO public.system_parameters(key, value, description)
VALUES ('checkout_v2', '"legado"'::jsonb, 'Checkout v2 (legado|v2). Só super admin altera.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.checkout_v2_mode()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value #>> '{}' FROM public.system_parameters WHERE key = 'checkout_v2'), 'legado')
$$;

CREATE OR REPLACE FUNCTION public.checkout_v2_set_mode(_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Somente super admin pode alterar o checkout v2' USING ERRCODE = '42501';
  END IF;
  IF _mode NOT IN ('legado','v2') THEN
    RAISE EXCEPTION 'Modo inválido: %', _mode USING ERRCODE = '22023';
  END IF;
  UPDATE public.system_parameters SET value = to_jsonb(_mode), updated_by = auth.uid(), updated_at = now()
   WHERE key = 'checkout_v2';
END $$;

-- Motor de preço único (contratação nova). _itens:
-- {"modulos":[{"plano":"financeiro-gestao","empresas":2,"adicionais":[{"code":"usuarios","qtd":1}]}]}
CREATE OR REPLACE FUNCTION public.billing_v2_quote(_billing_account_id uuid, _itens jsonb, _billing_cycle text, _coupon_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb; a jsonb; p record; lim record; ad record; cp record;
  itens jsonb := '[]'::jsonb; erros jsonb := '[]'::jsonb; sugestoes jsonb := '[]'::jsonb;
  anual boolean := (_billing_cycle = 'yearly');
  meses int := CASE WHEN _billing_cycle = 'yearly' THEN 12 ELSE 1 END;
  plano_cents int; add_cents int; total int := 0; desconto_cupom int := 0; total_mensal_mod int;
  emp int; extra int; up record;
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

    -- empresas cobertas
    emp := greatest(coalesce((m->>'empresas')::int, 1), 1);
    SELECT * INTO lim FROM plan_limits WHERE plan_id = p.id AND recurso = 'empresas';
    extra := greatest(emp - coalesce(lim.incluido, 1), 0);
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
    FOR up IN SELECT slug, name, price_monthly_cents FROM plans
      WHERE module = p.module AND is_active AND NOT is_enterprise AND sort_order > p.sort_order
        AND price_monthly_cents < total_mensal_mod ORDER BY price_monthly_cents LIMIT 1 LOOP
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
END $$;

REVOKE ALL ON FUNCTION public.billing_v2_quote(uuid, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_quote(uuid, jsonb, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkout_v2_mode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_v2_mode() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.checkout_v2_set_mode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_v2_set_mode(text) TO authenticated, service_role;