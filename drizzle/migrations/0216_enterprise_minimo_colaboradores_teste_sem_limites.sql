CREATE OR REPLACE FUNCTION public._billing_v2_colaboradores_ativos(_billing_account_id uuid, _company_id uuid DEFAULT NULL)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int FROM public.dp_colaboradores c
   WHERE c.ativo AND c.desligado_em IS NULL
     AND c.company_id IN (
       SELECT bac.company_id FROM public.billing_account_companies bac
        WHERE _billing_account_id IS NOT NULL AND bac.billing_account_id = _billing_account_id AND bac.removed_at IS NULL
       UNION SELECT _company_id WHERE _company_id IS NOT NULL);
$function$;

-- Enterprise (cobrado por colaborador ativo): contratação direta só a partir do mínimo do catálogo.
-- Assinatura já em vigor nesse plano (ativa, em atraso ou carência) segue renovando normalmente.
-- Devolve a mensagem de bloqueio, ou NULL quando a contratação direta é permitida.
CREATE OR REPLACE FUNCTION public._billing_v2_enterprise_bloqueio(_billing_account_id uuid, _company_id uuid, _plan_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; v_min int; v_n int;
BEGIN
  SELECT * INTO p FROM public.plans WHERE id = _plan_id;
  IF p.id IS NULL OR NULLIF(p.features->>'price_per_collaborator_cents', '') IS NULL THEN RETURN NULL; END IF;
  v_min := GREATEST(1, COALESCE(NULLIF(p.features->>'min_collaborators', '')::int, 1));
  IF EXISTS (SELECT 1 FROM public.subscriptions s
              WHERE s.plan_id = p.id AND s.status::text IN ('active','past_due','grace')
                AND ((_billing_account_id IS NOT NULL AND s.billing_account_id = _billing_account_id)
                  OR (_company_id IS NOT NULL AND s.company_id = _company_id))) THEN
    RETURN NULL;
  END IF;
  v_n := public._billing_v2_colaboradores_ativos(_billing_account_id, _company_id);
  IF v_n >= v_min THEN RETURN NULL; END IF;
  RETURN format('O %s é contratado direto a partir de %s colaboradores ativos. Para a sua equipe, fale com nosso especialista.',
    p.name, v_min);
END $function$;

-- Leitura para as telas: o Enterprise está liberado para contratação direta nesta empresa?
CREATE OR REPLACE FUNCTION public.billing_v2_enterprise_elegibilidade(_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; v_ba uuid; v_bloq text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public._is_company_member(_company_id, auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO p FROM public.plans
   WHERE module = 'pessoas' AND is_active AND NOT is_enterprise
     AND NULLIF(features->>'price_per_collaborator_cents', '') IS NOT NULL
   ORDER BY sort_order LIMIT 1;
  IF p.id IS NULL THEN RETURN jsonb_build_object('plano', NULL, 'liberado', false); END IF;
  SELECT billing_account_id INTO v_ba FROM public.billing_account_companies
   WHERE company_id = _company_id AND removed_at IS NULL LIMIT 1;
  v_bloq := public._billing_v2_enterprise_bloqueio(v_ba, _company_id, p.id);
  RETURN jsonb_build_object(
    'plano', p.slug,
    'minimo', GREATEST(1, COALESCE(NULLIF(p.features->>'min_collaborators', '')::int, 1)),
    'colaboradores', public._billing_v2_colaboradores_ativos(v_ba, _company_id),
    'liberado', v_bloq IS NULL,
    'mensagem', v_bloq);
END $function$;

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
  por_colab boolean; colab_extra int; colab_total int; bloqueio text;
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
    -- plano por colaborador ativo (Enterprise): contratação direta só com o mínimo de colaboradores ativos
    bloqueio := public._billing_v2_enterprise_bloqueio(_billing_account_id, NULL, p.id);
    IF bloqueio IS NOT NULL THEN
      erros := erros || to_jsonb(bloqueio);
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

CREATE OR REPLACE FUNCTION public.billing_v2_plan_change_quote(_subscription_id uuid, _plan_slug text, _billing_cycle text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s record; pa record; pn record; l record; nl record;
  ciclo_atual text; ciclo_novo text := _billing_cycle;
  val_atual int; val_novo int; frac numeric := 0; credito int := 0; cobrar int := 0;
  tipo text; efetivo timestamptz; impeditivos jsonb := '[]'::jsonb; novo_lim int; cortesia boolean; bloqueio text;
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
  IF pn.id <> pa.id THEN
    bloqueio := public._billing_v2_enterprise_bloqueio(s.billing_account_id, s.company_id, pn.id);
    IF bloqueio IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'erros', jsonb_build_array(bloqueio));
    END IF;
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
END $function$;

CREATE OR REPLACE FUNCTION public.assinatura_limite_excedido(_company_id uuid, _modulo text, _recurso text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_sub public.subscriptions;
  v_features jsonb := '{}'::jsonb;
  v_exempt boolean := false;
  v_addon int := 0;
  v_lim int;
  v_used int;
  v_col text := CASE _recurso
    WHEN 'colaboradores' THEN 'max_collaborators'
    WHEN 'unidades' THEN 'max_units'
    ELSE NULL END;
BEGIN
  IF v_col IS NULL OR _company_id IS NULL THEN RETURN false; END IF;

  SELECT user_id INTO v_owner FROM public.companies WHERE id = _company_id;
  IF v_owner IS NULL THEN RETURN false; END IF;

  SELECT s.* INTO v_sub FROM public.subscriptions s
  WHERE s.user_id = v_owner AND (s.module = _modulo OR s.module IS NULL)
  ORDER BY (s.module = _modulo) DESC, s.created_at DESC LIMIT 1;

  IF v_sub.id IS NULL THEN RETURN false; END IF;

  v_exempt := COALESCE(v_sub.is_exempt, false) AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until > now());
  IF v_exempt THEN RETURN false; END IF;

  -- Teste grátis em vigor: nada é limitado (colaboradores e unidades), sem cobrança extra (o plano é enquadrado no fim do teste).
  IF v_sub.status::text = 'trialing'
     AND COALESCE(v_sub.trial_ends_at > now(), false) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.features, '{}'::jsonb) INTO v_features FROM public.plans p WHERE p.id = v_sub.plan_id;
  v_lim := NULLIF(v_features ->> v_col, '')::int;
  IF v_lim IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(SUM(sa.quantity), 0)::int INTO v_addon
  FROM public.subscription_addons sa
  JOIN public.plan_addons a ON a.id = sa.addon_id
  WHERE sa.subscription_id = v_sub.id AND sa.status = 'active' AND a.code = _recurso;

  IF _recurso = 'colaboradores' THEN
    SELECT COUNT(*) INTO v_used FROM public.dp_colaboradores c
    WHERE c.company_id = _company_id AND c.ativo AND c.desligado_em IS NULL;
  ELSE
    SELECT COUNT(*) INTO v_used FROM public.dp_unidades u
    WHERE u.company_id = _company_id AND u.ativo;
  END IF;

  RETURN v_used > (v_lim + v_addon);
END; $function$;

CREATE OR REPLACE FUNCTION public.assinatura_limites(_company_id uuid, _modulo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sub public.subscriptions;
  v_features jsonb := '{}'::jsonb;
  v_owner uuid;
  v_exempt boolean := false;
  v_teste boolean := false;
  v_addons jsonb := '{}'::jsonb;
  v_limits jsonb := '{}'::jsonb;
  v_used jsonb := '{}'::jsonb;
  v_lim int;
  v_key text;
  v_map jsonb := jsonb_build_object(
    'colaboradores','max_collaborators',
    'unidades','max_units',
    'empresas','max_companies',
    'usuarios','max_users',
    'open_finance','max_open_finance',
    'contadores','accountant_seats'
  );
BEGIN
  SELECT user_id INTO v_owner FROM public.companies WHERE id = _company_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  IF NOT (v_owner = auth.uid() OR public.is_super_admin(auth.uid()) OR auth.role() = 'service_role'
          OR EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = auth.uid())) THEN
    RETURN NULL;
  END IF;

  SELECT s.* INTO v_sub FROM public.subscriptions s
  WHERE s.user_id = v_owner AND (s.module = _modulo OR s.module IS NULL)
  ORDER BY (s.module = _modulo) DESC, s.created_at DESC LIMIT 1;

  IF v_sub.id IS NOT NULL THEN
    SELECT COALESCE(p.features, '{}'::jsonb) INTO v_features FROM public.plans p WHERE p.id = v_sub.plan_id;
    v_exempt := COALESCE(v_sub.is_exempt, false) AND (v_sub.exempt_until IS NULL OR v_sub.exempt_until > now());
    -- Teste grátis em vigor: nenhum limite (o plano é enquadrado no fim do teste)
    v_teste := v_sub.status::text = 'trialing' AND COALESCE(v_sub.trial_ends_at > now(), false);
    SELECT COALESCE(jsonb_object_agg(a.code, sa.qty), '{}'::jsonb) INTO v_addons
    FROM (SELECT addon_id, SUM(quantity)::int AS qty FROM public.subscription_addons
          WHERE subscription_id = v_sub.id AND status = 'active' GROUP BY addon_id) sa
    JOIN public.plan_addons a ON a.id = sa.addon_id;
  ELSE
    v_exempt := true;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_map) LOOP
    IF v_exempt OR v_teste THEN
      v_limits := v_limits || jsonb_build_object(v_key, -1);
    ELSE
      v_lim := NULLIF(v_features ->> (v_map ->> v_key), '')::int;
      IF v_lim IS NULL THEN
        v_limits := v_limits || jsonb_build_object(v_key, -1);
      ELSE
        v_limits := v_limits || jsonb_build_object(v_key, v_lim + COALESCE((v_addons ->> v_key)::int, 0));
      END IF;
    END IF;
  END LOOP;

  v_used := jsonb_build_object(
    'colaboradores', (SELECT COUNT(*) FROM public.dp_colaboradores c WHERE c.company_id = _company_id AND c.ativo AND c.desligado_em IS NULL),
    'unidades', (SELECT COUNT(*) FROM public.dp_unidades u WHERE u.company_id = _company_id AND u.ativo),
    'empresas', (SELECT COUNT(*) FROM public.companies c WHERE c.user_id = v_owner),
    'usuarios', (SELECT COUNT(*) FROM public.company_members m WHERE m.company_id = _company_id AND m.role <> 'contabilidade'),
    'open_finance', (SELECT COUNT(*) FROM public.pluggy_connections pc WHERE pc.company_id = _company_id AND (pc.status IS NULL OR pc.status::text NOT IN ('deleted','revoked'))),
    'contadores', (SELECT COUNT(*) FROM public.company_members m WHERE m.company_id = _company_id AND m.role = 'contabilidade')
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'module', _modulo,
    'exempt', v_exempt,
    'em_teste', v_teste,
    'limits', v_limits,
    'used', v_used,
    'addons', v_addons
  );
END; $function$;

REVOKE ALL ON FUNCTION public._billing_v2_colaboradores_ativos(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._billing_v2_colaboradores_ativos(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public._billing_v2_enterprise_bloqueio(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._billing_v2_enterprise_bloqueio(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.billing_v2_enterprise_elegibilidade(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_v2_enterprise_elegibilidade(uuid) TO authenticated, service_role;