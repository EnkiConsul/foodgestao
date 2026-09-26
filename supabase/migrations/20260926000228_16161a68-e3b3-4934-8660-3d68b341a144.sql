-- 1) Pró-rata dos adicionais
ALTER TABLE public.subscription_addons
  ADD COLUMN IF NOT EXISTS prorata_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prorata_billed_at timestamptz;

CREATE OR REPLACE FUNCTION public.subscription_addon_set_prorata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_total numeric;
  v_left numeric;
BEGIN
  IF NEW.is_exempt OR COALESCE(NEW.price_cents, 0) = 0 THEN
    NEW.prorata_cents := 0;
    RETURN NEW;
  END IF;

  SELECT s.current_period_start, s.current_period_end INTO v_start, v_end
  FROM public.subscriptions s WHERE s.id = NEW.subscription_id;

  IF v_start IS NULL OR v_end IS NULL OR v_end <= v_start OR now() >= v_end THEN
    NEW.prorata_cents := 0;
    RETURN NEW;
  END IF;

  v_total := EXTRACT(EPOCH FROM (v_end - v_start));
  v_left := EXTRACT(EPOCH FROM (v_end - GREATEST(now(), v_start)));
  NEW.prorata_cents := GREATEST(0, ROUND(NEW.price_cents * NEW.quantity * (v_left / v_total)))::int;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_subscription_addon_prorata ON public.subscription_addons;
CREATE TRIGGER trg_subscription_addon_prorata
  BEFORE INSERT ON public.subscription_addons
  FOR EACH ROW EXECUTE FUNCTION public.subscription_addon_set_prorata();

-- 2) Total da assinatura passa a expor o pró-rata pendente
DROP FUNCTION IF EXISTS public.subscription_total_cents(uuid);
CREATE FUNCTION public.subscription_total_cents(_subscription_id uuid)
RETURNS TABLE(plan_cents integer, addons_cents integer, prorata_pending_cents integer, total_cents integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      s.id,
      s.is_exempt,
      COALESCE(p.price_cents, 0)::int AS plan_cents,
      COALESCE((SELECT SUM(sa.quantity * sa.price_cents) FROM public.subscription_addons sa
                WHERE sa.subscription_id = s.id AND sa.status = 'active' AND sa.is_exempt = false), 0)::int AS addons_cents,
      COALESCE((SELECT SUM(sa.prorata_cents) FROM public.subscription_addons sa
                WHERE sa.subscription_id = s.id AND sa.status = 'active' AND sa.is_exempt = false
                  AND sa.prorata_billed_at IS NULL), 0)::int AS prorata_cents
    FROM public.subscriptions s
    LEFT JOIN public.plans p ON p.id = s.plan_id
    WHERE s.id = _subscription_id
      AND (s.user_id = auth.uid() OR public.is_super_admin(auth.uid()) OR auth.role() = 'service_role')
  )
  SELECT plan_cents, addons_cents, prorata_cents,
         (CASE WHEN is_exempt THEN 0 ELSE plan_cents + addons_cents + prorata_cents END)::int
  FROM base;
$$;

REVOKE ALL ON FUNCTION public.subscription_total_cents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_total_cents(uuid) TO authenticated, service_role;

-- 3) Trava de limite no servidor
CREATE OR REPLACE FUNCTION public.assinatura_limite_excedido(_company_id uuid, _modulo text, _recurso text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
END; $$;

REVOKE ALL ON FUNCTION public.assinatura_limite_excedido(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assinatura_limite_excedido(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dp_guard_limite_colaborador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo AND NEW.desligado_em IS NULL
     AND public.assinatura_limite_excedido(NEW.company_id, 'pessoas', 'colaboradores') THEN
    RAISE EXCEPTION 'Limite do plano atingido: não é possível incluir mais colaboradores. Contrate um adicional para ampliar o limite.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_dp_guard_limite_colaborador ON public.dp_colaboradores;
CREATE CONSTRAINT TRIGGER trg_dp_guard_limite_colaborador
  AFTER INSERT ON public.dp_colaboradores
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.dp_guard_limite_colaborador();

CREATE OR REPLACE FUNCTION public.dp_guard_limite_unidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo AND public.assinatura_limite_excedido(NEW.company_id, 'pessoas', 'unidades') THEN
    RAISE EXCEPTION 'Limite do plano atingido: não é possível incluir mais unidades. Contrate um adicional para ampliar o limite.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS trg_dp_guard_limite_unidade ON public.dp_unidades;
CREATE CONSTRAINT TRIGGER trg_dp_guard_limite_unidade
  AFTER INSERT ON public.dp_unidades
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.dp_guard_limite_unidade();