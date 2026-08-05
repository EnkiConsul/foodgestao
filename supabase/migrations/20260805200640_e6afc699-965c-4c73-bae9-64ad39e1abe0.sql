-- =========================================================
-- PEDIDOS FASE 8 — Expiração do trial, modo consulta e contratação
-- =========================================================

ALTER TABLE public.ped_units
  ADD COLUMN IF NOT EXISTS blocked_by_trial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS state_before_block public.ped_unit_state;

ALTER TABLE public.ped_order_channels
  ADD COLUMN IF NOT EXISTS paused_by_trial boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_modules
  ADD COLUMN IF NOT EXISTS expirado_em timestamptz,
  ADD COLUMN IF NOT EXISTS retention_days smallint NOT NULL DEFAULT 180;

-- ---------------------------------------------------------
-- Helper: módulo utilizável (independe do usuário)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_module_usable(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_modules cm
     WHERE cm.company_id = p_company_id AND cm.module = 'pedidos'
       AND (
         cm.status = 'active'
         OR (cm.status = 'trial' AND cm.trial_termina_em IS NOT NULL AND cm.trial_termina_em > now())
       )
  );
$$;

-- ---------------------------------------------------------
-- Bloqueio controlado de uma empresa (idempotente)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_block_company(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.company_modules;
  v_units int := 0;
  v_channels int := 0;
BEGIN
  SELECT * INTO v_row FROM public.company_modules
   WHERE company_id = p_company_id AND module = 'pedidos' FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('changed', false, 'code', 'not_contracted');
  END IF;
  IF v_row.status <> 'trial' OR v_row.trial_termina_em IS NULL OR v_row.trial_termina_em > now() THEN
    RETURN jsonb_build_object('changed', false, 'code', 'not_expired', 'status', v_row.status);
  END IF;

  UPDATE public.company_modules
     SET status = 'trial_expirado',
         expirado_em = COALESCE(expirado_em, v_row.trial_termina_em),
         ends_at = COALESCE(ends_at, v_row.trial_termina_em),
         updated_at = now()
   WHERE id = v_row.id;

  -- pausa unidades abertas guardando o estado anterior
  WITH upd AS (
    UPDATE public.ped_units
       SET state_before_block = COALESCE(state_before_block, operational_state),
           blocked_by_trial = true,
           operational_state = 'paused'
     WHERE company_id = p_company_id
       AND operational_state IN ('open','scheduled_only')
    RETURNING 1
  ) SELECT count(*) INTO v_units FROM upd;

  -- desativa canais próprios de captação
  WITH upd AS (
    UPDATE public.ped_order_channels
       SET is_active = false, paused_by_trial = true
     WHERE company_id = p_company_id AND is_active
       AND kind IN ('link_proprio','whatsapp','telefone','integracao')
    RETURNING 1
  ) SELECT count(*) INTO v_channels FROM upd;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_trial_expired', 'company_modules', v_row.id::text,
    jsonb_build_object('company_id', p_company_id, 'trial_ends_at', v_row.trial_termina_em,
      'units_paused', v_units, 'channels_paused', v_channels));

  RETURN jsonb_build_object('changed', true, 'code', 'expired',
    'units_paused', v_units, 'channels_paused', v_channels);
END; $$;

-- Enforcement em tempo real: chamado antes de qualquer operação de escrita
CREATE OR REPLACE FUNCTION public.orders_enforce_expiration(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_needs boolean;
BEGIN
  IF p_company_id IS NULL THEN RETURN false; END IF;
  SELECT true INTO v_needs FROM public.company_modules
   WHERE company_id = p_company_id AND module = 'pedidos'
     AND status = 'trial' AND trial_termina_em IS NOT NULL AND trial_termina_em <= now();
  IF NOT COALESCE(v_needs, false) THEN RETURN false; END IF;
  PERFORM public.orders_block_company(p_company_id);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_assert_orders_operation(p_company_id uuid, p_operation text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  -- fail closed em tempo real: expira o trial no momento da operação
  PERFORM public.orders_enforce_expiration(p_company_id);
  v_ent := public.can_use_orders_module(p_company_id, p_operation);
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false)
     OR COALESCE((v_ent->>'read_only')::boolean, true) THEN
    RAISE EXCEPTION 'Sem permissão para % (%).', p_operation, coalesce(v_ent->>'reason','forbidden')
      USING ERRCODE = '42501';
  END IF;
END; $$;

-- Impede abrir unidade sem direito de uso (mesmo por caminhos diretos)
CREATE OR REPLACE FUNCTION public.ped_units_guard_entitlement()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.operational_state IN ('open','scheduled_only')
     AND NEW.operational_state IS DISTINCT FROM OLD.operational_state
     AND NOT public.orders_module_usable(NEW.company_id) THEN
    RAISE EXCEPTION 'O módulo Pedidos não está ativo. Contrate o módulo para abrir a unidade.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ped_units_guard_entitlement ON public.ped_units;
CREATE TRIGGER trg_ped_units_guard_entitlement BEFORE UPDATE ON public.ped_units
FOR EACH ROW EXECUTE FUNCTION public.ped_units_guard_entitlement();

-- ---------------------------------------------------------
-- Job idempotente de expiração
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_orders_trials()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  v_res jsonb;
  v_expired int := 0; v_units int := 0; v_channels int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a rotina do sistema pode expirar testes.' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT company_id FROM public.company_modules
     WHERE module = 'pedidos' AND status = 'trial'
       AND trial_termina_em IS NOT NULL AND trial_termina_em <= now()
     ORDER BY trial_termina_em
     LIMIT 500
  LOOP
    v_res := public.orders_block_company(r.company_id);
    IF COALESCE((v_res->>'changed')::boolean, false) THEN
      v_expired := v_expired + 1;
      v_units := v_units + COALESCE((v_res->>'units_paused')::int, 0);
      v_channels := v_channels + COALESCE((v_res->>'channels_paused')::int, 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'expired', v_expired,
    'units_paused', v_units, 'channels_paused', v_channels, 'ran_at', now());
END; $$;

-- ---------------------------------------------------------
-- Contratação atômica
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_orders_module(
  p_company_id uuid,
  p_valor_mensal numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_reopen_units boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company public.companies;
  v_role text;
  v_row public.company_modules;
  v_units int := 0;
  v_channels int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'unauthenticated',
      'message', 'Sessão expirada. Faça login novamente.');
  END IF;
  IF p_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'no_company',
      'message', 'Selecione uma empresa.');
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = p_company_id;
  IF v_company.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'company_not_found',
      'message', 'Empresa não encontrada.');
  END IF;

  SELECT cm.role::text INTO v_role FROM public.company_members cm
   WHERE cm.user_id = v_uid AND cm.company_id = p_company_id;
  IF v_role IS NULL AND (v_company.user_id = v_uid OR v_company.owner_id = v_uid) THEN
    v_role := 'owner';
  END IF;
  IF v_role IS NULL AND public.is_super_admin(v_uid) THEN v_role := 'admin'; END IF;
  IF v_role IS NULL OR v_role NOT IN ('owner','admin') THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden',
      'message', 'Apenas o proprietário ou administrador da empresa pode contratar o módulo.');
  END IF;

  SELECT * INTO v_row FROM public.company_modules
   WHERE company_id = p_company_id AND module = 'pedidos' FOR UPDATE;

  IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_active',
      'message', 'O módulo Pedidos já está ativo nesta empresa.',
      'contratado_em', v_row.contratado_em);
  END IF;

  IF v_row.id IS NULL THEN
    INSERT INTO public.company_modules (company_id, module, status, starts_at, contratado_em, valor_mensal)
    VALUES (p_company_id, 'pedidos', 'active', now(), now(), p_valor_mensal)
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.company_modules
       SET status = 'active',
           starts_at = COALESCE(starts_at, now()),
           ends_at = NULL,
           cancelado_em = NULL,
           contratado_em = COALESCE(contratado_em, now()),
           valor_mensal = COALESCE(p_valor_mensal, valor_mensal),
           updated_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  -- restaura canais pausados pela expiração
  WITH upd AS (
    UPDATE public.ped_order_channels
       SET is_active = true, paused_by_trial = false
     WHERE company_id = p_company_id AND paused_by_trial
    RETURNING 1
  ) SELECT count(*) INTO v_channels FROM upd;

  -- restaura unidades: volta ao estado anterior somente se solicitado
  WITH upd AS (
    UPDATE public.ped_units
       SET operational_state = CASE
             WHEN COALESCE(p_reopen_units, false)
               THEN COALESCE(state_before_block, operational_state)
             ELSE 'closed'::public.ped_unit_state END,
           blocked_by_trial = false,
           state_before_block = NULL
     WHERE company_id = p_company_id AND blocked_by_trial
    RETURNING 1
  ) SELECT count(*) INTO v_units FROM upd;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_uid, 'orders_module_contracted', 'company_modules', v_row.id::text,
    jsonb_build_object('company_id', p_company_id, 'role', v_role,
      'reference', nullif(btrim(p_reference), ''), 'units_restored', v_units,
      'channels_restored', v_channels, 'reopened', COALESCE(p_reopen_units, false)));

  RETURN jsonb_build_object('success', true, 'code', 'contracted',
    'message', 'Módulo Pedidos ativado. Seus dados e configurações foram mantidos.',
    'contratado_em', v_row.contratado_em, 'units_restored', v_units,
    'channels_restored', v_channels);
END; $$;

-- ---------------------------------------------------------
-- Resumo do trial / modo consulta
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_trial_snapshot(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ent jsonb;
  v_row public.company_modules;
  v_units int; v_open_units int; v_menus int; v_products int; v_orders int; v_test_orders int;
  v_inflight int; v_payments int; v_customers int;
  v_pending jsonb := '[]'::jsonb;
  v_checklist jsonb;
  u record;
BEGIN
  v_ent := public.can_use_orders_module(p_company_id, 'orders.dashboard');
  IF v_ent->>'role' IS NULL THEN
    RAISE EXCEPTION 'Sem acesso ao módulo Pedidos desta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.company_modules
   WHERE company_id = p_company_id AND module = 'pedidos';

  SELECT count(*), count(*) FILTER (WHERE operational_state IN ('open','scheduled_only'))
    INTO v_units, v_open_units FROM public.ped_units WHERE company_id = p_company_id;
  SELECT count(*) INTO v_menus FROM public.ped_menus WHERE company_id = p_company_id;
  SELECT count(*) INTO v_products FROM public.ped_products WHERE company_id = p_company_id;
  SELECT count(*) FILTER (WHERE NOT is_test), count(*) FILTER (WHERE is_test),
         count(*) FILTER (WHERE status IN ('pending_acceptance','accepted','waiting_scheduled_start',
                                           'preparation_started','ready','awaiting_pickup','dispatched')),
         count(DISTINCT customer_id)
    INTO v_orders, v_test_orders, v_inflight, v_customers
    FROM public.ped_orders WHERE company_id = p_company_id;
  SELECT count(*) INTO v_payments FROM public.ped_order_payments WHERE company_id = p_company_id;

  FOR u IN SELECT id, codigo_interno FROM public.ped_units WHERE company_id = p_company_id LOOP
    v_checklist := public.ped_unit_checklist(u.id);
    IF NOT COALESCE((v_checklist->>'ready')::boolean, false) THEN
      v_pending := v_pending || jsonb_build_array(jsonb_build_object(
        'unit_id', u.id, 'unit_code', u.codigo_interno,
        'missing', (SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
                      FROM jsonb_each_text(v_checklist->'items') WHERE value::boolean IS NOT TRUE)));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'entitlement', v_ent,
    'status', COALESCE(v_row.status::text, 'not_contracted'),
    'trial_started_at', v_row.trial_iniciado_em,
    'trial_ends_at', v_row.trial_termina_em,
    'expired_at', v_row.expirado_em,
    'contracted_at', v_row.contratado_em,
    'server_now', now(),
    'retention_days', COALESCE(v_row.retention_days, 180),
    'consulta_until', CASE WHEN v_row.expirado_em IS NOT NULL
      THEN v_row.expirado_em + (COALESCE(v_row.retention_days, 180) || ' days')::interval END,
    'usage', jsonb_build_object(
      'units', v_units, 'open_units', v_open_units, 'menus', v_menus, 'products', v_products,
      'orders', v_orders, 'test_orders', v_test_orders, 'in_flight_orders', v_inflight,
      'payments', v_payments, 'customers', v_customers),
    'pending_setup', v_pending);
END; $$;

-- ---------------------------------------------------------
-- Exportação (permitida em modo consulta)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_export_orders(
  p_company_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 5000
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ent jsonb; v_rows jsonb;
BEGIN
  v_ent := public.can_use_orders_module(p_company_id, 'orders.reports');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Sem permissão para exportar pedidos.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(t ORDER BY t.placed_at), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.display_number, o.placed_at, o.status::text AS status,
           o.order_type::text AS order_type, o.order_timing::text AS order_timing,
           o.payment_status::text AS payment_status, o.subtotal, o.discount_amount,
           o.delivery_fee, o.service_fee, o.total_amount, o.is_test,
           o.customer_name, o.notes, o.completed_at, o.cancelled_at, o.cancellation_reason
      FROM public.ped_orders o
     WHERE o.company_id = p_company_id
       AND (p_from IS NULL OR o.placed_at >= p_from)
       AND (p_to IS NULL OR o.placed_at <= p_to)
     ORDER BY o.placed_at DESC
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 20000)
  ) t;

  RETURN jsonb_build_object('success', true, 'count', jsonb_array_length(v_rows), 'rows', v_rows);
END; $$;

-- ---------------------------------------------------------
-- Retenção configurável (backoffice)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_orders_retention_days(p_company_id uuid, p_days smallint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores do sistema alteram a retenção.' USING ERRCODE = '42501';
  END IF;
  IF p_days IS NULL OR p_days < 30 OR p_days > 3650 THEN
    RAISE EXCEPTION 'A retenção deve ficar entre 30 e 3650 dias.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.company_modules SET retention_days = p_days, updated_at = now()
   WHERE company_id = p_company_id AND module = 'pedidos';
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_retention_updated', 'company_modules', p_company_id::text,
    jsonb_build_object('retention_days', p_days));
  RETURN jsonb_build_object('success', true, 'retention_days', p_days);
END; $$;

-- ---------------------------------------------------------
-- PERMISSÕES DE EXECUÇÃO
-- ---------------------------------------------------------
REVOKE ALL ON FUNCTION public.orders_block_company(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orders_enforce_expiration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_orders_trials() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_orders_trials() TO service_role;
GRANT EXECUTE ON FUNCTION public.orders_block_company(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.orders_enforce_expiration(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.orders_module_usable(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_module_usable(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.contract_orders_module(uuid, numeric, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_orders_module(uuid, numeric, text, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.orders_trial_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orders_trial_snapshot(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_export_orders(uuid, timestamptz, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_export_orders(uuid, timestamptz, timestamptz, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_orders_retention_days(uuid, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_orders_retention_days(uuid, smallint) TO authenticated, service_role;