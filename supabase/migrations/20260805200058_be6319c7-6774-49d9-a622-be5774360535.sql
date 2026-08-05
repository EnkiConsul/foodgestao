-- =========================================================
-- PEDIDOS FASE 7 — Entrega, retirada, mesas, pagamentos e agendados
-- =========================================================

-- ---------- COLUNAS NOVAS ----------
ALTER TABLE public.ped_units
  ADD COLUMN IF NOT EXISTS delivery_provider_default public.ped_delivery_provider NOT NULL DEFAULT 'propria',
  ADD COLUMN IF NOT EXISTS max_delivery_distance_meters integer,
  ADD COLUMN IF NOT EXISTS min_order_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_code_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS service_fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tables_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scheduled_lead_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS scheduled_max_days smallint NOT NULL DEFAULT 7;

ALTER TABLE public.ped_orders
  ADD COLUMN IF NOT EXISTS pickup_code text,
  ADD COLUMN IF NOT EXISTS pickup_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS table_session_id uuid;

ALTER TABLE public.ped_order_deliveries
  ADD COLUMN IF NOT EXISTS provider public.ped_delivery_provider NOT NULL DEFAULT 'propria',
  ADD COLUMN IF NOT EXISTS zone_id uuid,
  ADD COLUMN IF NOT EXISTS eta_minutes integer,
  ADD COLUMN IF NOT EXISTS partner_name text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz;

ALTER TABLE public.ped_order_payments
  ADD COLUMN IF NOT EXISTS tendered_amount integer,
  ADD COLUMN IF NOT EXISTS change_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ped_order_payments_idem_uk
  ON public.ped_order_payments (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------- ÁREAS DE ENTREGA ----------
CREATE TABLE IF NOT EXISTS public.ped_delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.ped_zone_kind NOT NULL DEFAULT 'bairro',
  provider public.ped_delivery_provider NOT NULL DEFAULT 'propria',
  bairros text[] NOT NULL DEFAULT '{}',
  cep_start text,
  cep_end text,
  min_distance_meters integer,
  max_distance_meters integer,
  fee_amount integer NOT NULL DEFAULT 0,
  min_order_amount integer NOT NULL DEFAULT 0,
  eta_minutes integer NOT NULL DEFAULT 40,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_delivery_zones_amounts_chk CHECK (fee_amount >= 0 AND min_order_amount >= 0 AND eta_minutes > 0),
  CONSTRAINT ped_delivery_zones_dist_chk CHECK (
    (min_distance_meters IS NULL OR min_distance_meters >= 0)
    AND (max_distance_meters IS NULL OR max_distance_meters >= 0)
    AND (min_distance_meters IS NULL OR max_distance_meters IS NULL OR max_distance_meters >= min_distance_meters)
  )
);
CREATE INDEX IF NOT EXISTS idx_ped_delivery_zones_unit ON public.ped_delivery_zones (unit_id, sort_order);
GRANT SELECT ON public.ped_delivery_zones TO authenticated;
GRANT ALL ON public.ped_delivery_zones TO service_role;
ALTER TABLE public.ped_delivery_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY ped_delivery_zones_read ON public.ped_delivery_zones
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

ALTER TABLE public.ped_order_deliveries
  DROP CONSTRAINT IF EXISTS ped_order_deliveries_zone_fk;
ALTER TABLE public.ped_order_deliveries
  ADD CONSTRAINT ped_order_deliveries_zone_fk
  FOREIGN KEY (zone_id) REFERENCES public.ped_delivery_zones(id) ON DELETE SET NULL;

-- ---------- AMBIENTES E MESAS ----------
CREATE TABLE IF NOT EXISTS public.ped_service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ped_service_areas_unit ON public.ped_service_areas (unit_id, sort_order);
GRANT SELECT ON public.ped_service_areas TO authenticated;
GRANT ALL ON public.ped_service_areas TO service_role;
ALTER TABLE public.ped_service_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ped_service_areas_read ON public.ped_service_areas
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

CREATE TABLE IF NOT EXISTS public.ped_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.ped_service_areas(id) ON DELETE SET NULL,
  code text NOT NULL,
  label text,
  seats smallint NOT NULL DEFAULT 2,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_tables_seats_chk CHECK (seats > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ped_tables_unit_code_uk ON public.ped_tables (unit_id, lower(code));
GRANT SELECT ON public.ped_tables TO authenticated;
GRANT ALL ON public.ped_tables TO service_role;
ALTER TABLE public.ped_tables ENABLE ROW LEVEL SECURITY;
CREATE POLICY ped_tables_read ON public.ped_tables
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

CREATE TABLE IF NOT EXISTS public.ped_table_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.ped_tables(id) ON DELETE CASCADE,
  status public.ped_table_session_status NOT NULL DEFAULT 'aberta',
  guests smallint NOT NULL DEFAULT 1,
  customer_name text,
  note text,
  service_fee_percent numeric(5,2) NOT NULL DEFAULT 0,
  merged_into_session_id uuid REFERENCES public.ped_table_sessions(id) ON DELETE SET NULL,
  opened_by uuid,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_table_sessions_guests_chk CHECK (guests > 0),
  CONSTRAINT ped_table_sessions_fee_chk CHECK (service_fee_percent >= 0 AND service_fee_percent <= 30)
);
CREATE UNIQUE INDEX IF NOT EXISTS ped_table_sessions_open_uk
  ON public.ped_table_sessions (table_id) WHERE status IN ('aberta','fechando');
CREATE INDEX IF NOT EXISTS idx_ped_table_sessions_unit ON public.ped_table_sessions (unit_id, status);
GRANT SELECT ON public.ped_table_sessions TO authenticated;
GRANT ALL ON public.ped_table_sessions TO service_role;
ALTER TABLE public.ped_table_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY ped_table_sessions_read ON public.ped_table_sessions
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

ALTER TABLE public.ped_orders DROP CONSTRAINT IF EXISTS ped_orders_table_session_fk;
ALTER TABLE public.ped_orders
  ADD CONSTRAINT ped_orders_table_session_fk
  FOREIGN KEY (table_session_id) REFERENCES public.ped_table_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ped_orders_table_session ON public.ped_orders (table_session_id)
  WHERE table_session_id IS NOT NULL;

-- ---------- TRIGGERS updated_at ----------
DROP TRIGGER IF EXISTS trg_ped_delivery_zones_touch ON public.ped_delivery_zones;
CREATE TRIGGER trg_ped_delivery_zones_touch BEFORE UPDATE ON public.ped_delivery_zones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ped_service_areas_touch ON public.ped_service_areas;
CREATE TRIGGER trg_ped_service_areas_touch BEFORE UPDATE ON public.ped_service_areas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ped_tables_touch ON public.ped_tables;
CREATE TRIGGER trg_ped_tables_touch BEFORE UPDATE ON public.ped_tables
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ped_table_sessions_touch ON public.ped_table_sessions;
CREATE TRIGGER trg_ped_table_sessions_touch BEFORE UPDATE ON public.ped_table_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- MÁQUINA DE ESTADOS (novo estado agendado) ----------
CREATE OR REPLACE FUNCTION public.ped_order_transition_allowed(
  p_from public.ped_order_status, p_to public.ped_order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (p_from::text || '>' || p_to::text) = ANY (ARRAY[
    'pending_acceptance>accepted',
    'pending_acceptance>cancelled',
    'pending_acceptance>failed',
    'accepted>waiting_scheduled_start',
    'accepted>preparation_started',
    'accepted>ready',
    'accepted>cancellation_requested',
    'accepted>cancelled',
    'accepted>failed',
    'waiting_scheduled_start>accepted',
    'waiting_scheduled_start>preparation_started',
    'waiting_scheduled_start>cancellation_requested',
    'waiting_scheduled_start>cancelled',
    'waiting_scheduled_start>failed',
    'preparation_started>ready',
    'preparation_started>cancellation_requested',
    'preparation_started>cancelled',
    'preparation_started>failed',
    'ready>awaiting_pickup',
    'ready>dispatched',
    'ready>delivered',
    'ready>completed',
    'ready>cancellation_requested',
    'ready>cancelled',
    'awaiting_pickup>delivered',
    'awaiting_pickup>completed',
    'awaiting_pickup>cancellation_requested',
    'awaiting_pickup>cancelled',
    'dispatched>delivered',
    'dispatched>failed',
    'dispatched>cancellation_requested',
    'delivered>completed',
    'delivered>partially_refunded',
    'delivered>refunded',
    'completed>partially_refunded',
    'completed>refunded',
    'cancellation_requested>cancelled',
    'cancellation_requested>accepted',
    'cancellation_requested>preparation_started',
    'cancellation_requested>ready',
    'cancelled>refunded',
    'cancelled>partially_refunded',
    'partially_refunded>refunded'
  ]);
$$;

-- =========================================================
-- RPCs — CONFIGURAÇÃO DE SERVIÇOS
-- =========================================================
CREATE OR REPLACE FUNCTION public.ped_save_unit_service_settings(
  p_unit_id uuid,
  p_delivery_provider_default text DEFAULT NULL,
  p_max_delivery_distance_meters integer DEFAULT NULL,
  p_min_order_amount integer DEFAULT NULL,
  p_pickup_code_required boolean DEFAULT NULL,
  p_service_fee_percent numeric DEFAULT NULL,
  p_tables_enabled boolean DEFAULT NULL,
  p_scheduled_lead_minutes integer DEFAULT NULL,
  p_scheduled_max_days smallint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_unit public.ped_units;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_unit.company_id, 'orders.settings');

  IF p_service_fee_percent IS NOT NULL AND (p_service_fee_percent < 0 OR p_service_fee_percent > 30) THEN
    RAISE EXCEPTION 'A taxa de serviço deve ficar entre 0%% e 30%%.' USING ERRCODE = '22023';
  END IF;
  IF p_scheduled_lead_minutes IS NOT NULL AND p_scheduled_lead_minutes < 0 THEN
    RAISE EXCEPTION 'A antecedência de agendamento não pode ser negativa.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.ped_units SET
    delivery_provider_default = COALESCE(p_delivery_provider_default::public.ped_delivery_provider, delivery_provider_default),
    max_delivery_distance_meters = COALESCE(p_max_delivery_distance_meters, max_delivery_distance_meters),
    min_order_amount = COALESCE(p_min_order_amount, min_order_amount),
    pickup_code_required = COALESCE(p_pickup_code_required, pickup_code_required),
    service_fee_percent = COALESCE(p_service_fee_percent, service_fee_percent),
    tables_enabled = COALESCE(p_tables_enabled, tables_enabled),
    scheduled_lead_minutes = COALESCE(p_scheduled_lead_minutes, scheduled_lead_minutes),
    scheduled_max_days = COALESCE(p_scheduled_max_days, scheduled_max_days)
  WHERE id = p_unit_id
  RETURNING * INTO v_unit;

  RETURN jsonb_build_object('success', true, 'unit_id', v_unit.id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_upsert_delivery_zone(
  p_unit_id uuid,
  p_name text,
  p_kind text,
  p_zone_id uuid DEFAULT NULL,
  p_provider text DEFAULT 'propria',
  p_bairros text[] DEFAULT '{}',
  p_cep_start text DEFAULT NULL,
  p_cep_end text DEFAULT NULL,
  p_min_distance_meters integer DEFAULT NULL,
  p_max_distance_meters integer DEFAULT NULL,
  p_fee_amount integer DEFAULT 0,
  p_min_order_amount integer DEFAULT 0,
  p_eta_minutes integer DEFAULT 40,
  p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_unit public.ped_units;
  v_kind public.ped_zone_kind := p_kind::public.ped_zone_kind;
  v_id uuid;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_unit.company_id, 'orders.settings');

  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome da área de entrega.' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'bairro' AND COALESCE(array_length(p_bairros, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um bairro para esta área.' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'cep' AND (nullif(btrim(p_cep_start), '') IS NULL OR nullif(btrim(p_cep_end), '') IS NULL) THEN
    RAISE EXCEPTION 'Informe a faixa de CEP (início e fim).' USING ERRCODE = '22023';
  END IF;
  IF v_kind = 'distancia' AND p_max_distance_meters IS NULL THEN
    RAISE EXCEPTION 'Informe a distância máxima da área.' USING ERRCODE = '22023';
  END IF;

  IF p_zone_id IS NULL THEN
    INSERT INTO public.ped_delivery_zones (
      company_id, unit_id, name, kind, provider, bairros, cep_start, cep_end,
      min_distance_meters, max_distance_meters, fee_amount, min_order_amount,
      eta_minutes, is_active, sort_order, created_by)
    VALUES (v_unit.company_id, p_unit_id, btrim(p_name), v_kind,
      COALESCE(p_provider, 'propria')::public.ped_delivery_provider,
      COALESCE(p_bairros, '{}'), nullif(btrim(p_cep_start), ''), nullif(btrim(p_cep_end), ''),
      p_min_distance_meters, p_max_distance_meters, GREATEST(COALESCE(p_fee_amount, 0), 0),
      GREATEST(COALESCE(p_min_order_amount, 0), 0), GREATEST(COALESCE(p_eta_minutes, 40), 1),
      COALESCE(p_is_active, true), COALESCE(p_sort_order, 0), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ped_delivery_zones SET
      name = btrim(p_name), kind = v_kind,
      provider = COALESCE(p_provider, 'propria')::public.ped_delivery_provider,
      bairros = COALESCE(p_bairros, '{}'),
      cep_start = nullif(btrim(p_cep_start), ''), cep_end = nullif(btrim(p_cep_end), ''),
      min_distance_meters = p_min_distance_meters, max_distance_meters = p_max_distance_meters,
      fee_amount = GREATEST(COALESCE(p_fee_amount, 0), 0),
      min_order_amount = GREATEST(COALESCE(p_min_order_amount, 0), 0),
      eta_minutes = GREATEST(COALESCE(p_eta_minutes, 40), 1),
      is_active = COALESCE(p_is_active, true), sort_order = COALESCE(p_sort_order, 0)
    WHERE id = p_zone_id AND unit_id = p_unit_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Área de entrega não encontrada.' USING ERRCODE = 'P0002'; END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'zone_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_delete_delivery_zone(p_zone_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.ped_delivery_zones WHERE id = p_zone_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Área de entrega não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_company, 'orders.settings');
  DELETE FROM public.ped_delivery_zones WHERE id = p_zone_id;
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_quote_delivery(
  p_unit_id uuid,
  p_bairro text DEFAULT NULL,
  p_cep text DEFAULT NULL,
  p_distance_meters integer DEFAULT NULL,
  p_subtotal integer DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_unit public.ped_units;
  v_zone public.ped_delivery_zones;
  v_cep text := regexp_replace(COALESCE(p_cep, ''), '\D', '', 'g');
  v_bairro text := lower(btrim(COALESCE(p_bairro, '')));
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.ped_can_read_orders(v_unit.company_id) THEN
    RAISE EXCEPTION 'Sem permissão para consultar entregas.' USING ERRCODE = '42501';
  END IF;

  IF v_unit.max_delivery_distance_meters IS NOT NULL AND p_distance_meters IS NOT NULL
     AND p_distance_meters > v_unit.max_delivery_distance_meters THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'out_of_range',
      'message', 'Endereço fora do raio de entrega da unidade.');
  END IF;

  SELECT * INTO v_zone FROM public.ped_delivery_zones z
   WHERE z.unit_id = p_unit_id AND z.is_active
     AND (
       (z.kind = 'bairro' AND v_bairro <> '' AND EXISTS (
          SELECT 1 FROM unnest(z.bairros) b WHERE lower(btrim(b)) = v_bairro))
       OR (z.kind = 'cep' AND v_cep <> '' AND v_cep >= regexp_replace(COALESCE(z.cep_start,''), '\D', '', 'g')
           AND v_cep <= regexp_replace(COALESCE(z.cep_end,''), '\D', '', 'g'))
       OR (z.kind = 'distancia' AND p_distance_meters IS NOT NULL
           AND p_distance_meters >= COALESCE(z.min_distance_meters, 0)
           AND p_distance_meters <= COALESCE(z.max_distance_meters, 2147483647))
       OR z.kind = 'fixa'
     )
   ORDER BY (z.kind = 'fixa'), z.sort_order, z.fee_amount
   LIMIT 1;

  IF v_zone.id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'no_zone',
      'message', 'Nenhuma área de entrega atende este endereço.');
  END IF;

  IF COALESCE(p_subtotal, 0) < GREATEST(v_zone.min_order_amount, v_unit.min_order_amount) THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'below_minimum',
      'zone_id', v_zone.id, 'fee_amount', v_zone.fee_amount, 'eta_minutes', v_zone.eta_minutes,
      'min_order_amount', GREATEST(v_zone.min_order_amount, v_unit.min_order_amount),
      'message', 'Pedido abaixo do valor mínimo para esta área.');
  END IF;

  RETURN jsonb_build_object('allowed', true, 'code', 'ok', 'zone_id', v_zone.id,
    'zone_name', v_zone.name, 'provider', v_zone.provider, 'fee_amount', v_zone.fee_amount,
    'eta_minutes', v_zone.eta_minutes,
    'min_order_amount', GREATEST(v_zone.min_order_amount, v_unit.min_order_amount));
END; $$;

-- =========================================================
-- RPCs — ENTREGA E RETIRADA
-- =========================================================
CREATE OR REPLACE FUNCTION public.ped_set_order_delivery(
  p_order_id uuid,
  p_address jsonb DEFAULT NULL,
  p_zone_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_partner_name text DEFAULT NULL,
  p_tracking_code text DEFAULT NULL,
  p_eta_minutes integer DEFAULT NULL,
  p_fee_amount integer DEFAULT NULL,
  p_courier_phone text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.ped_orders;
  v_old_fee integer;
  v_delta integer := 0;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, 'orders.delivery');

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_order.version THEN
    RETURN jsonb_build_object('success', false, 'code', 'version_conflict',
      'message', 'O pedido foi atualizado por outro usuário. Recarregue.');
  END IF;
  IF v_order.status IN ('cancelled','refunded','failed','completed') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_state',
      'message', 'Pedido encerrado não aceita alteração de entrega.');
  END IF;

  INSERT INTO public.ped_order_deliveries (company_id, order_id, address, fee_amount)
  VALUES (v_order.company_id, v_order.id, COALESCE(p_address, '{}'::jsonb), COALESCE(p_fee_amount, 0))
  ON CONFLICT (order_id) DO NOTHING;

  SELECT fee_amount INTO v_old_fee FROM public.ped_order_deliveries WHERE order_id = v_order.id FOR UPDATE;

  UPDATE public.ped_order_deliveries SET
    address = COALESCE(p_address, address),
    zone_id = COALESCE(p_zone_id, zone_id),
    provider = COALESCE(p_provider::public.ped_delivery_provider, provider),
    partner_name = COALESCE(nullif(btrim(p_partner_name), ''), partner_name),
    tracking_code = COALESCE(nullif(btrim(p_tracking_code), ''), tracking_code),
    courier_phone = COALESCE(nullif(btrim(p_courier_phone), ''), courier_phone),
    eta_minutes = COALESCE(p_eta_minutes, eta_minutes),
    fee_amount = GREATEST(COALESCE(p_fee_amount, fee_amount), 0)
  WHERE order_id = v_order.id;

  IF p_fee_amount IS NOT NULL AND GREATEST(p_fee_amount, 0) <> COALESCE(v_old_fee, 0) THEN
    v_delta := GREATEST(p_fee_amount, 0) - COALESCE(v_old_fee, 0);
    UPDATE public.ped_orders SET
      delivery_fee = GREATEST(delivery_fee + v_delta, 0),
      total_amount = GREATEST(total_amount + v_delta, 0),
      estimated_net_amount = GREATEST(total_amount + v_delta, 0),
      version = version + 1
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    INSERT INTO public.ped_order_adjustments (
      company_id, order_id, kind, amount, reason, total_before, total_after, created_by)
    VALUES (v_order.company_id, v_order.id, 'delivery_fee', v_delta, 'Taxa de entrega da área',
      v_order.total_amount - v_delta, v_order.total_amount, auth.uid());
  END IF;

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id,
    'total_amount', v_order.total_amount, 'version', v_order.version);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_assign_courier(
  p_order_id uuid,
  p_courier_user_id uuid DEFAULT NULL,
  p_courier_name text DEFAULT NULL,
  p_courier_phone text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order public.ped_orders;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, 'orders.delivery');

  IF p_courier_user_id IS NULL AND nullif(btrim(p_courier_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o entregador responsável.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.ped_order_deliveries (company_id, order_id, status, courier_user_id, courier_name, courier_phone, assigned_at)
  VALUES (v_order.company_id, v_order.id, 'assigned', p_courier_user_id,
    nullif(btrim(p_courier_name), ''), nullif(btrim(p_courier_phone), ''), now())
  ON CONFLICT (order_id) DO UPDATE SET
    status = CASE WHEN public.ped_order_deliveries.status IN ('pending','assigned')
      THEN 'assigned'::public.ped_delivery_status ELSE public.ped_order_deliveries.status END,
    courier_user_id = COALESCE(EXCLUDED.courier_user_id, public.ped_order_deliveries.courier_user_id),
    courier_name = COALESCE(EXCLUDED.courier_name, public.ped_order_deliveries.courier_name),
    courier_phone = COALESCE(EXCLUDED.courier_phone, public.ped_order_deliveries.courier_phone),
    assigned_at = COALESCE(public.ped_order_deliveries.assigned_at, now());

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_mark_delivery_failed(
  p_order_id uuid, p_reason text, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF nullif(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da falha na entrega.' USING ERRCODE = '22023';
  END IF;
  v_res := public.ped_order_transition(p_order_id, 'failed', 'orders.dispatch',
    p_expected_version, p_reason, 'painel', '{}'::jsonb, p_idempotency_key);
  IF COALESCE((v_res->>'success')::boolean, false) THEN
    UPDATE public.ped_order_deliveries
       SET status = 'failed', failure_reason = btrim(p_reason), failed_at = now()
     WHERE order_id = p_order_id;
  END IF;
  RETURN v_res;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_generate_pickup_code(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order public.ped_orders; v_code text;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, 'orders.dispatch');

  IF v_order.pickup_code IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'pickup_code', v_order.pickup_code, 'code', 'already_exists');
  END IF;
  v_code := lpad((floor(random() * 10000))::int::text, 4, '0');
  UPDATE public.ped_orders SET pickup_code = v_code WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'pickup_code', v_code);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_confirm_pickup(
  p_order_id uuid, p_code text DEFAULT NULL, p_expected_version integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order public.ped_orders; v_unit public.ped_units; v_res jsonb;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, 'orders.dispatch');
  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_order.unit_id;

  IF COALESCE(v_unit.pickup_code_required, true) AND v_order.pickup_code IS NOT NULL
     AND regexp_replace(COALESCE(p_code, ''), '\D', '', 'g') <> v_order.pickup_code THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_pickup_code',
      'message', 'Código de retirada inválido.');
  END IF;

  v_res := public.ped_order_transition(p_order_id, 'delivered', 'orders.dispatch',
    p_expected_version, NULL, 'painel', jsonb_build_object('pickup', true), p_idempotency_key);
  IF COALESCE((v_res->>'success')::boolean, false) THEN
    UPDATE public.ped_orders SET pickup_confirmed_at = COALESCE(pickup_confirmed_at, now())
     WHERE id = p_order_id;
  END IF;
  RETURN v_res;
END; $$;

-- =========================================================
-- RPCs — PAGAMENTOS
-- =========================================================
CREATE OR REPLACE FUNCTION public.ped_sync_order_payment_status(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.ped_orders;
  v_paid integer; v_refunded integer; v_status public.ped_payment_status;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(sum(amount), 0), COALESCE(sum(refunded_amount), 0)
    INTO v_paid, v_refunded
    FROM public.ped_order_payments
   WHERE order_id = p_order_id AND status IN ('paid','authorized','partially_refunded','refunded');

  v_status := CASE
    WHEN v_refunded > 0 AND v_refunded >= v_paid AND v_paid > 0 THEN 'refunded'
    WHEN v_refunded > 0 THEN 'partially_refunded'
    WHEN v_paid >= v_order.total_amount AND v_order.total_amount > 0 THEN 'paid'
    WHEN v_paid > 0 THEN 'authorized'
    ELSE 'pending' END;

  UPDATE public.ped_orders SET payment_status = v_status WHERE id = p_order_id;

  RETURN jsonb_build_object('success', true, 'payment_status', v_status,
    'paid_amount', v_paid, 'refunded_amount', v_refunded,
    'due_amount', GREATEST(v_order.total_amount - (v_paid - v_refunded), 0));
END; $$;

CREATE OR REPLACE FUNCTION public.ped_register_order_payment(
  p_order_id uuid,
  p_kind text,
  p_amount integer,
  p_payment_method_id uuid DEFAULT NULL,
  p_is_online boolean DEFAULT false,
  p_tendered_amount integer DEFAULT NULL,
  p_external_payment_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.ped_orders;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_change integer := 0;
  v_paid integer;
  v_payment_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor de pagamento maior que zero.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, 'orders.manage');

  IF v_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ped_order_payments WHERE order_id = p_order_id AND idempotency_key = v_key) THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_applied',
      'message', 'Pagamento já registrado.');
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.status IN ('cancelled','refunded','failed') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_state',
      'message', 'Pedido encerrado não aceita novos pagamentos.');
  END IF;

  SELECT COALESCE(sum(amount - refunded_amount), 0) INTO v_paid
    FROM public.ped_order_payments
   WHERE order_id = p_order_id AND status IN ('paid','authorized','partially_refunded');

  IF v_paid + p_amount > v_order.total_amount THEN
    RETURN jsonb_build_object('success', false, 'code', 'amount_exceeds_total',
      'due_amount', GREATEST(v_order.total_amount - v_paid, 0),
      'message', 'O valor informado ultrapassa o total do pedido.');
  END IF;

  IF p_kind = 'dinheiro' AND p_tendered_amount IS NOT NULL THEN
    IF p_tendered_amount < p_amount THEN
      RETURN jsonb_build_object('success', false, 'code', 'insufficient_tender',
        'message', 'O valor recebido é menor que o valor do pagamento.');
    END IF;
    v_change := p_tendered_amount - p_amount;
  END IF;

  INSERT INTO public.ped_order_payments (
    company_id, order_id, kind, payment_method_id, amount, status, is_online,
    external_payment_id, paid_at, tendered_amount, change_amount, note, idempotency_key, created_by)
  VALUES (v_order.company_id, v_order.id, COALESCE(p_kind, 'outro')::public.ped_payment_kind,
    p_payment_method_id, p_amount, 'paid', COALESCE(p_is_online, false),
    nullif(btrim(p_external_payment_id), ''), now(), p_tendered_amount, v_change,
    nullif(btrim(p_note), ''), v_key, auth.uid())
  RETURNING id INTO v_payment_id;

  PERFORM public.ped_sync_order_payment_status(p_order_id);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_payment_registered', 'ped_order_payments', v_payment_id::text,
    jsonb_build_object('order_id', p_order_id, 'amount', p_amount, 'kind', p_kind));

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'change_amount', v_change,
    'due_amount', GREATEST(v_order.total_amount - (v_paid + p_amount), 0));
END; $$;

CREATE OR REPLACE FUNCTION public.ped_refund_order_payment(
  p_payment_id uuid, p_amount integer, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pay public.ped_order_payments;
BEGIN
  SELECT * INTO v_pay FROM public.ped_order_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_pay.company_id, 'orders.refund');

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Informe um valor de estorno maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF v_pay.refunded_amount + p_amount > v_pay.amount THEN
    RETURN jsonb_build_object('success', false, 'code', 'amount_exceeds_payment',
      'message', 'Estorno maior que o valor pago neste pagamento.');
  END IF;

  UPDATE public.ped_order_payments SET
    refunded_amount = refunded_amount + p_amount,
    status = CASE WHEN refunded_amount + p_amount >= amount THEN 'refunded'::public.ped_payment_status
                  ELSE 'partially_refunded'::public.ped_payment_status END,
    refunded_at = now(),
    refund_reason = COALESCE(nullif(btrim(p_reason), ''), refund_reason)
  WHERE id = p_payment_id;

  PERFORM public.ped_sync_order_payment_status(v_pay.order_id);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_payment_refunded', 'ped_order_payments', p_payment_id::text,
    jsonb_build_object('order_id', v_pay.order_id, 'amount', p_amount, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id);
END; $$;

-- =========================================================
-- RPCs — MESAS E COMANDAS
-- =========================================================
CREATE OR REPLACE FUNCTION public.ped_upsert_table(
  p_unit_id uuid, p_code text, p_table_id uuid DEFAULT NULL, p_label text DEFAULT NULL,
  p_area_id uuid DEFAULT NULL, p_seats smallint DEFAULT 2, p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_unit public.ped_units; v_id uuid;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_unit.company_id, 'orders.settings');
  IF nullif(btrim(p_code), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o número/código da mesa.' USING ERRCODE = '22023';
  END IF;

  IF p_table_id IS NULL THEN
    INSERT INTO public.ped_tables (company_id, unit_id, area_id, code, label, seats, is_active, sort_order)
    VALUES (v_unit.company_id, p_unit_id, p_area_id, btrim(p_code), nullif(btrim(p_label), ''),
      GREATEST(COALESCE(p_seats, 2), 1), COALESCE(p_is_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ped_tables SET
      area_id = p_area_id, code = btrim(p_code), label = nullif(btrim(p_label), ''),
      seats = GREATEST(COALESCE(p_seats, 2), 1), is_active = COALESCE(p_is_active, true),
      sort_order = COALESCE(p_sort_order, 0)
    WHERE id = p_table_id AND unit_id = p_unit_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Mesa não encontrada.' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'table_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_upsert_service_area(
  p_unit_id uuid, p_name text, p_area_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT true, p_sort_order integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_unit public.ped_units; v_id uuid;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_unit.company_id, 'orders.settings');
  IF nullif(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do ambiente.' USING ERRCODE = '22023';
  END IF;

  IF p_area_id IS NULL THEN
    INSERT INTO public.ped_service_areas (company_id, unit_id, name, is_active, sort_order)
    VALUES (v_unit.company_id, p_unit_id, btrim(p_name), COALESCE(p_is_active, true), COALESCE(p_sort_order, 0))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ped_service_areas SET name = btrim(p_name),
      is_active = COALESCE(p_is_active, true), sort_order = COALESCE(p_sort_order, 0)
    WHERE id = p_area_id AND unit_id = p_unit_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Ambiente não encontrado.' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('success', true, 'area_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_open_table_session(
  p_table_id uuid, p_guests smallint DEFAULT 1, p_customer_name text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_table public.ped_tables; v_unit public.ped_units; v_id uuid;
BEGIN
  SELECT * INTO v_table FROM public.ped_tables WHERE id = p_table_id;
  IF v_table.id IS NULL THEN RAISE EXCEPTION 'Mesa não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_table.company_id, 'orders.manage');
  IF NOT v_table.is_active THEN
    RAISE EXCEPTION 'Mesa inativa não pode receber comanda.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_table.unit_id;

  SELECT id INTO v_id FROM public.ped_table_sessions
   WHERE table_id = p_table_id AND status IN ('aberta','fechando');
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_open', 'session_id', v_id,
      'message', 'Esta mesa já possui uma comanda aberta.');
  END IF;

  INSERT INTO public.ped_table_sessions (
    company_id, unit_id, table_id, guests, customer_name, note, service_fee_percent, opened_by)
  VALUES (v_table.company_id, v_table.unit_id, p_table_id, GREATEST(COALESCE(p_guests, 1), 1),
    nullif(btrim(p_customer_name), ''), nullif(btrim(p_note), ''),
    COALESCE(v_unit.service_fee_percent, 0), auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'session_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_attach_order_to_session(p_session_id uuid, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_session public.ped_table_sessions; v_order public.ped_orders;
BEGIN
  SELECT * INTO v_session FROM public.ped_table_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_session.company_id, 'orders.manage');
  IF v_session.status <> 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'code', 'session_closed',
      'message', 'A comanda não está aberta.');
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_order.company_id <> v_session.company_id OR v_order.unit_id <> v_session.unit_id THEN
    RAISE EXCEPTION 'Pedido de outra unidade não pode ser vinculado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.ped_orders SET table_session_id = p_session_id WHERE id = p_order_id;
  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'order_id', p_order_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_transfer_table_session(p_session_id uuid, p_target_table_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_session public.ped_table_sessions; v_table public.ped_tables;
BEGIN
  SELECT * INTO v_session FROM public.ped_table_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_session.company_id, 'orders.manage');
  IF v_session.status <> 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'code', 'session_closed',
      'message', 'Somente comandas abertas podem ser transferidas.');
  END IF;

  SELECT * INTO v_table FROM public.ped_tables WHERE id = p_target_table_id;
  IF v_table.id IS NULL OR v_table.unit_id <> v_session.unit_id THEN
    RAISE EXCEPTION 'Mesa de destino inválida.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ped_table_sessions
              WHERE table_id = p_target_table_id AND status IN ('aberta','fechando')) THEN
    RETURN jsonb_build_object('success', false, 'code', 'target_busy',
      'message', 'A mesa de destino já possui uma comanda aberta.');
  END IF;

  UPDATE public.ped_table_sessions SET table_id = p_target_table_id WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'table_id', p_target_table_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_merge_table_sessions(p_source_session_id uuid, p_target_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_src public.ped_table_sessions; v_dst public.ped_table_sessions;
BEGIN
  IF p_source_session_id = p_target_session_id THEN
    RAISE EXCEPTION 'Selecione comandas diferentes para juntar.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_src FROM public.ped_table_sessions WHERE id = p_source_session_id FOR UPDATE;
  SELECT * INTO v_dst FROM public.ped_table_sessions WHERE id = p_target_session_id FOR UPDATE;
  IF v_src.id IS NULL OR v_dst.id IS NULL THEN
    RAISE EXCEPTION 'Comanda não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_src.company_id, 'orders.manage');
  IF v_src.unit_id <> v_dst.unit_id THEN
    RAISE EXCEPTION 'Comandas de unidades diferentes não podem ser juntadas.' USING ERRCODE = '42501';
  END IF;
  IF v_src.status <> 'aberta' OR v_dst.status <> 'aberta' THEN
    RETURN jsonb_build_object('success', false, 'code', 'session_closed',
      'message', 'Só é possível juntar comandas abertas.');
  END IF;

  UPDATE public.ped_orders SET table_session_id = p_target_session_id WHERE table_session_id = p_source_session_id;
  UPDATE public.ped_table_sessions
     SET status = 'fechada', closed_at = now(), closed_by = auth.uid(),
         merged_into_session_id = p_target_session_id
   WHERE id = p_source_session_id;
  UPDATE public.ped_table_sessions SET guests = LEAST(v_src.guests + v_dst.guests, 32767)
   WHERE id = p_target_session_id;

  RETURN jsonb_build_object('success', true, 'session_id', p_target_session_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_table_session_summary(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_session public.ped_table_sessions;
  v_total integer; v_paid integer; v_open integer; v_orders integer;
BEGIN
  SELECT * INTO v_session FROM public.ped_table_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.ped_can_read_orders(v_session.company_id) THEN
    RAISE EXCEPTION 'Sem permissão para ver comandas.' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*), COALESCE(sum(total_amount), 0),
         COUNT(*) FILTER (WHERE status NOT IN ('completed','delivered','cancelled','refunded','failed'))
    INTO v_orders, v_total, v_open
    FROM public.ped_orders
   WHERE table_session_id = p_session_id AND status <> 'cancelled';

  SELECT COALESCE(sum(p.amount - p.refunded_amount), 0) INTO v_paid
    FROM public.ped_order_payments p
    JOIN public.ped_orders o ON o.id = p.order_id
   WHERE o.table_session_id = p_session_id
     AND p.status IN ('paid','authorized','partially_refunded');

  RETURN jsonb_build_object(
    'session_id', v_session.id, 'status', v_session.status, 'orders_count', v_orders,
    'open_orders', v_open, 'subtotal', v_total,
    'service_fee_percent', v_session.service_fee_percent,
    'service_fee', round(v_total * v_session.service_fee_percent / 100.0)::int,
    'total', v_total + round(v_total * v_session.service_fee_percent / 100.0)::int,
    'paid_amount', v_paid,
    'due_amount', GREATEST(v_total + round(v_total * v_session.service_fee_percent / 100.0)::int - v_paid, 0));
END; $$;

CREATE OR REPLACE FUNCTION public.ped_close_table_session(
  p_session_id uuid, p_service_fee_percent numeric DEFAULT NULL, p_force boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_session public.ped_table_sessions; v_summary jsonb;
BEGIN
  SELECT * INTO v_session FROM public.ped_table_sessions WHERE id = p_session_id FOR UPDATE;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Comanda não encontrada.' USING ERRCODE = 'P0002'; END IF;
  PERFORM public.ped_assert_orders_operation(v_session.company_id, 'orders.manage');
  IF v_session.status = 'fechada' THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_closed', 'session_id', p_session_id);
  END IF;

  IF p_service_fee_percent IS NOT NULL THEN
    IF p_service_fee_percent < 0 OR p_service_fee_percent > 30 THEN
      RAISE EXCEPTION 'A taxa de serviço deve ficar entre 0%% e 30%%.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.ped_table_sessions SET service_fee_percent = p_service_fee_percent WHERE id = p_session_id;
  END IF;

  v_summary := public.ped_table_session_summary(p_session_id);

  IF NOT COALESCE(p_force, false) THEN
    IF (v_summary->>'open_orders')::int > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'open_orders',
        'summary', v_summary, 'message', 'Existem pedidos em aberto nesta comanda.');
    END IF;
    IF (v_summary->>'due_amount')::int > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'pending_payment',
        'summary', v_summary, 'message', 'Ainda há valor a receber nesta comanda.');
    END IF;
  ELSE
    PERFORM public.ped_assert_orders_operation(v_session.company_id, 'orders.settings');
  END IF;

  UPDATE public.ped_table_sessions
     SET status = 'fechada', closed_at = now(), closed_by = auth.uid()
   WHERE id = p_session_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'table_session_closed', 'ped_table_sessions', p_session_id::text,
    jsonb_build_object('forced', COALESCE(p_force, false), 'summary', v_summary));

  RETURN jsonb_build_object('success', true, 'session_id', p_session_id, 'summary', v_summary);
END; $$;

-- =========================================================
-- RPCs — AGENDADOS
-- =========================================================
CREATE OR REPLACE FUNCTION public.ped_hold_scheduled_order(
  p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_order public.ped_orders;
BEGIN
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF v_order.order_timing <> 'scheduled' THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_scheduled',
      'message', 'Somente pedidos agendados podem aguardar o horário.');
  END IF;
  RETURN public.ped_order_transition(p_order_id, 'waiting_scheduled_start', 'orders.prepare',
    p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_activate_scheduled_order(
  p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.ped_order_transition(p_order_id, 'preparation_started', 'orders.prepare',
    p_expected_version, NULL, 'painel', jsonb_build_object('scheduled_release', true), p_idempotency_key);
  IF COALESCE((v_res->>'success')::boolean, false) THEN
    UPDATE public.ped_orders SET scheduled_activated_at = COALESCE(scheduled_activated_at, now())
     WHERE id = p_order_id;
  END IF;
  RETURN v_res;
END; $$;

-- =========================================================
-- PERMISSÕES DE EXECUÇÃO
-- =========================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'ped_save_unit_service_settings','ped_upsert_delivery_zone','ped_delete_delivery_zone',
         'ped_quote_delivery','ped_set_order_delivery','ped_assign_courier','ped_mark_delivery_failed',
         'ped_generate_pickup_code','ped_confirm_pickup','ped_sync_order_payment_status',
         'ped_register_order_payment','ped_refund_order_payment','ped_upsert_table',
         'ped_upsert_service_area','ped_open_table_session','ped_attach_order_to_session',
         'ped_transfer_table_session','ped_merge_table_sessions','ped_table_session_summary',
         'ped_close_table_session','ped_hold_scheduled_order','ped_activate_scheduled_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;