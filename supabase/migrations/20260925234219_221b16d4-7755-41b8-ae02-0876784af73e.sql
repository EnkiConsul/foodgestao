CREATE OR REPLACE FUNCTION public.subscription_total_cents(_subscription_id uuid)
RETURNS TABLE(plan_cents integer, addons_cents integer, total_cents integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COALESCE(p.price_cents, 0)::int AS plan_cents,
    COALESCE((
      SELECT SUM(sa.quantity * sa.price_cents)
      FROM public.subscription_addons sa
      WHERE sa.subscription_id = s.id AND sa.status = 'active' AND sa.is_exempt = false
    ), 0)::int AS addons_cents,
    (CASE WHEN s.is_exempt THEN 0 ELSE COALESCE(p.price_cents, 0) + COALESCE((
      SELECT SUM(sa.quantity * sa.price_cents)
      FROM public.subscription_addons sa
      WHERE sa.subscription_id = s.id AND sa.status = 'active' AND sa.is_exempt = false
    ), 0) END)::int AS total_cents
  FROM public.subscriptions s
  LEFT JOIN public.plans p ON p.id = s.plan_id
  WHERE s.id = _subscription_id
    AND (s.user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR auth.role() = 'service_role');
$$;
REVOKE ALL ON FUNCTION public.subscription_total_cents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_total_cents(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assinatura_limites(_company_id uuid, _modulo text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sub public.subscriptions;
  v_features jsonb := '{}'::jsonb;
  v_owner uuid;
  v_exempt boolean := false;
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
    SELECT COALESCE(jsonb_object_agg(a.code, sa.qty), '{}'::jsonb) INTO v_addons
    FROM (SELECT addon_id, SUM(quantity)::int AS qty FROM public.subscription_addons
          WHERE subscription_id = v_sub.id AND status = 'active' GROUP BY addon_id) sa
    JOIN public.plan_addons a ON a.id = sa.addon_id;
  ELSE
    v_exempt := true;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_map) LOOP
    IF v_exempt THEN
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
    'open_finance', (SELECT COUNT(*) FROM public.pluggy_connections pc WHERE pc.company_id = _company_id),
    'contadores', (SELECT COUNT(*) FROM public.company_members m WHERE m.company_id = _company_id AND m.role = 'contabilidade')
  );

  RETURN jsonb_build_object(
    'subscription_id', v_sub.id,
    'module', _modulo,
    'exempt', v_exempt,
    'limits', v_limits,
    'used', v_used,
    'addons', v_addons
  );
END; $$;
REVOKE ALL ON FUNCTION public.assinatura_limites(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assinatura_limites(uuid, text) TO authenticated, service_role;