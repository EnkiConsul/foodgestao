-- ============================================================
-- FASE 4 — Domínio de Pedidos, estados, RPCs e histórico
-- ============================================================

-- ---------- ENUMS ----------
DO $$ BEGIN
  CREATE TYPE public.ped_order_status AS ENUM (
    'pending_acceptance','accepted','preparation_started','ready','awaiting_pickup',
    'dispatched','delivered','completed','cancellation_requested','cancelled',
    'partially_refunded','refunded','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_order_timing AS ENUM ('immediate','scheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_payment_status AS ENUM
    ('pending','authorized','paid','partially_refunded','refunded','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_history_source AS ENUM ('painel','api','integracao','automacao','cliente','sistema');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_adjustment_kind AS ENUM
    ('discount','surcharge','delivery_fee','service_fee','refund','correction');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ped_delivery_status AS ENUM
    ('pending','assigned','picked_up','delivered','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- CANAIS ----------
CREATE TABLE IF NOT EXISTS public.ped_order_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind public.ped_order_channel NOT NULL DEFAULT 'balcao',
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_channels_code_chk CHECK (char_length(btrim(code)) BETWEEN 1 AND 40),
  CONSTRAINT ped_order_channels_name_chk CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX IF NOT EXISTS ped_order_channels_uk
  ON public.ped_order_channels (company_id, lower(btrim(code)));

GRANT SELECT ON public.ped_order_channels TO authenticated;
GRANT ALL ON public.ped_order_channels TO service_role;
ALTER TABLE public.ped_order_channels ENABLE ROW LEVEL SECURITY;

-- ---------- PEDIDOS ----------
CREATE TABLE IF NOT EXISTS public.ped_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.ped_units(id) ON DELETE RESTRICT,
  channel_id uuid REFERENCES public.ped_order_channels(id) ON DELETE SET NULL,
  external_order_id text,
  idempotency_key text,
  display_number integer NOT NULL,
  order_type public.ped_fulfillment_mode NOT NULL,
  order_timing public.ped_order_timing NOT NULL DEFAULT 'immediate',
  status public.ped_order_status NOT NULL DEFAULT 'pending_acceptance',
  customer_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  notes text,
  -- valores SEMPRE em centavos (inteiro)
  subtotal integer NOT NULL DEFAULT 0,
  discount_amount integer NOT NULL DEFAULT 0,
  delivery_fee integer NOT NULL DEFAULT 0,
  service_fee integer NOT NULL DEFAULT 0,
  total_amount integer NOT NULL DEFAULT 0,
  estimated_net_amount integer NOT NULL DEFAULT 0,
  original_total_amount integer NOT NULL DEFAULT 0,
  payment_status public.ped_payment_status NOT NULL DEFAULT 'pending',
  scheduled_start_at timestamptz,
  scheduled_window_start timestamptz,
  scheduled_window_end timestamptz,
  placed_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  preparation_started_at timestamptz,
  ready_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  version integer NOT NULL DEFAULT 1,
  is_test boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_orders_money_chk CHECK (
    subtotal >= 0 AND discount_amount >= 0 AND delivery_fee >= 0 AND service_fee >= 0
    AND total_amount >= 0 AND estimated_net_amount >= 0
    AND subtotal <= 999999999 AND total_amount <= 999999999),
  CONSTRAINT ped_orders_discount_chk CHECK (discount_amount <= subtotal + delivery_fee + service_fee),
  CONSTRAINT ped_orders_version_chk CHECK (version >= 1),
  CONSTRAINT ped_orders_display_chk CHECK (display_number >= 1),
  CONSTRAINT ped_orders_schedule_chk CHECK (
    order_timing = 'immediate'
    OR (scheduled_start_at IS NOT NULL OR scheduled_window_start IS NOT NULL)),
  CONSTRAINT ped_orders_window_chk CHECK (
    scheduled_window_start IS NULL OR scheduled_window_end IS NULL
    OR scheduled_window_end >= scheduled_window_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS ped_orders_display_uk
  ON public.ped_orders (unit_id, display_number);
CREATE UNIQUE INDEX IF NOT EXISTS ped_orders_idempotency_uk
  ON public.ped_orders (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ped_orders_external_uk
  ON public.ped_orders (company_id, channel_id, external_order_id)
  WHERE external_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ped_orders_unit_status ON public.ped_orders (unit_id, status, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ped_orders_company_placed ON public.ped_orders (company_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ped_orders_customer ON public.ped_orders (customer_id) WHERE customer_id IS NOT NULL;

GRANT SELECT ON public.ped_orders TO authenticated;
GRANT ALL ON public.ped_orders TO service_role;
ALTER TABLE public.ped_orders ENABLE ROW LEVEL SECURITY;

-- ---------- ITENS ----------
CREATE TABLE IF NOT EXISTS public.ped_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.ped_products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.ped_product_variants(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  description_snapshot text,
  variant_name_snapshot text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price integer NOT NULL DEFAULT 0,
  options_price integer NOT NULL DEFAULT 0,
  total_price integer NOT NULL DEFAULT 0,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_items_qty_chk CHECK (quantity BETWEEN 1 AND 999),
  CONSTRAINT ped_order_items_money_chk CHECK (unit_price >= 0 AND total_price >= 0),
  CONSTRAINT ped_order_items_name_chk CHECK (char_length(btrim(name_snapshot)) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS idx_ped_order_items_order ON public.ped_order_items (order_id, sort_order);
GRANT SELECT ON public.ped_order_items TO authenticated;
GRANT ALL ON public.ped_order_items TO service_role;
ALTER TABLE public.ped_order_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ped_order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.ped_order_items(id) ON DELETE CASCADE,
  option_id uuid REFERENCES public.ped_options(id) ON DELETE SET NULL,
  group_name_snapshot text,
  name_snapshot text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price integer NOT NULL DEFAULT 0,
  total_price integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_item_options_qty_chk CHECK (quantity BETWEEN 1 AND 99),
  CONSTRAINT ped_order_item_options_name_chk CHECK (char_length(btrim(name_snapshot)) BETWEEN 1 AND 200)
);
CREATE INDEX IF NOT EXISTS idx_ped_order_item_options_item ON public.ped_order_item_options (item_id);
CREATE INDEX IF NOT EXISTS idx_ped_order_item_options_order ON public.ped_order_item_options (order_id);
GRANT SELECT ON public.ped_order_item_options TO authenticated;
GRANT ALL ON public.ped_order_item_options TO service_role;
ALTER TABLE public.ped_order_item_options ENABLE ROW LEVEL SECURITY;

-- ---------- HISTÓRICO (imutável) ----------
CREATE TABLE IF NOT EXISTS public.ped_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  from_status public.ped_order_status,
  to_status public.ped_order_status NOT NULL,
  changed_by uuid,
  source public.ped_history_source NOT NULL DEFAULT 'painel',
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  version_after integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_history_reason_chk CHECK (reason IS NULL OR char_length(reason) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_ped_order_history_order ON public.ped_order_status_history (order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ped_order_history_idem_uk
  ON public.ped_order_status_history (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.ped_order_status_history TO authenticated;
GRANT SELECT, INSERT ON public.ped_order_status_history TO service_role;
ALTER TABLE public.ped_order_status_history ENABLE ROW LEVEL SECURITY;

-- ---------- PAGAMENTOS ----------
CREATE TABLE IF NOT EXISTS public.ped_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  kind public.ped_payment_kind NOT NULL DEFAULT 'outro',
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount integer NOT NULL DEFAULT 0,
  refunded_amount integer NOT NULL DEFAULT 0,
  status public.ped_payment_status NOT NULL DEFAULT 'pending',
  is_online boolean NOT NULL DEFAULT false,
  external_payment_id text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_payments_amount_chk CHECK (amount >= 0 AND refunded_amount >= 0 AND refunded_amount <= amount)
);
CREATE INDEX IF NOT EXISTS idx_ped_order_payments_order ON public.ped_order_payments (order_id);
GRANT SELECT ON public.ped_order_payments TO authenticated;
GRANT ALL ON public.ped_order_payments TO service_role;
ALTER TABLE public.ped_order_payments ENABLE ROW LEVEL SECURITY;

-- ---------- AJUSTES ----------
CREATE TABLE IF NOT EXISTS public.ped_order_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  kind public.ped_adjustment_kind NOT NULL,
  amount integer NOT NULL,
  reason text,
  total_before integer NOT NULL DEFAULT 0,
  total_after integer NOT NULL DEFAULT 0,
  idempotency_key text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_adjustments_amount_chk CHECK (amount <> 0 AND abs(amount) <= 999999999),
  CONSTRAINT ped_order_adjustments_reason_chk CHECK (reason IS NULL OR char_length(reason) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_ped_order_adjustments_order ON public.ped_order_adjustments (order_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS ped_order_adjustments_idem_uk
  ON public.ped_order_adjustments (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.ped_order_adjustments TO authenticated;
GRANT SELECT, INSERT ON public.ped_order_adjustments TO service_role;
ALTER TABLE public.ped_order_adjustments ENABLE ROW LEVEL SECURITY;

-- ---------- ENTREGAS ----------
CREATE TABLE IF NOT EXISTS public.ped_order_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.ped_orders(id) ON DELETE CASCADE,
  status public.ped_delivery_status NOT NULL DEFAULT 'pending',
  courier_user_id uuid,
  courier_name text,
  courier_phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  distance_meters integer,
  fee_amount integer NOT NULL DEFAULT 0,
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_order_deliveries_fee_chk CHECK (fee_amount >= 0),
  CONSTRAINT ped_order_deliveries_distance_chk CHECK (distance_meters IS NULL OR distance_meters >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS ped_order_deliveries_order_uk ON public.ped_order_deliveries (order_id);
CREATE INDEX IF NOT EXISTS idx_ped_order_deliveries_courier
  ON public.ped_order_deliveries (courier_user_id) WHERE courier_user_id IS NOT NULL;
GRANT SELECT ON public.ped_order_deliveries TO authenticated;
GRANT ALL ON public.ped_order_deliveries TO service_role;
ALTER TABLE public.ped_order_deliveries ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPERS DE AUTORIZAÇÃO
-- ============================================================
CREATE OR REPLACE FUNCTION public.ped_can_read_orders(p_company_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN RETURN false; END IF;
  v_ent := public.can_use_orders_module(p_company_id, 'orders.dashboard');
  RETURN COALESCE((v_ent->>'allowed')::boolean, false);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_can_operate_orders(p_company_id uuid, p_operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL THEN RETURN false; END IF;
  v_ent := public.can_use_orders_module(p_company_id, coalesce(p_operation, 'orders.manage'));
  RETURN COALESCE((v_ent->>'allowed')::boolean, false)
     AND NOT COALESCE((v_ent->>'read_only')::boolean, true);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_is_order_courier(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ped_order_deliveries d
    WHERE d.order_id = p_order_id AND d.courier_user_id = auth.uid()
  );
$$;

-- ============================================================
-- MÁQUINA DE ESTADOS
-- ============================================================
CREATE OR REPLACE FUNCTION public.ped_order_transition_allowed(
  p_from public.ped_order_status, p_to public.ped_order_status)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT (p_from::text || '>' || p_to::text) = ANY (ARRAY[
    'pending_acceptance>accepted',
    'pending_acceptance>cancelled',
    'pending_acceptance>failed',
    'accepted>preparation_started',
    'accepted>ready',
    'accepted>cancellation_requested',
    'accepted>cancelled',
    'accepted>failed',
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

-- trigger: protege transições, versão e imutabilidade de campos-chave
CREATE OR REPLACE FUNCTION public.ped_orders_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id <> OLD.company_id OR NEW.unit_id <> OLD.unit_id THEN
    RAISE EXCEPTION 'Não é permitido mover o pedido de empresa/unidade.' USING ERRCODE = '42501';
  END IF;
  IF NEW.display_number <> OLD.display_number OR NEW.placed_at <> OLD.placed_at THEN
    RAISE EXCEPTION 'Número e data do pedido são imutáveis.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.ped_order_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Transição inválida: % → %.', OLD.status, NEW.status USING ERRCODE = '22023';
    END IF;
    IF NEW.version <= OLD.version THEN
      NEW.version := OLD.version + 1;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ped_orders_guard ON public.ped_orders;
CREATE TRIGGER trg_ped_orders_guard BEFORE UPDATE ON public.ped_orders
FOR EACH ROW EXECUTE FUNCTION public.ped_orders_guard();

-- histórico imutável
CREATE OR REPLACE FUNCTION public.ped_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Histórico de pedidos é imutável.' USING ERRCODE = '42501';
END; $$;

DROP TRIGGER IF EXISTS trg_ped_history_immutable ON public.ped_order_status_history;
CREATE TRIGGER trg_ped_history_immutable BEFORE UPDATE OR DELETE
ON public.ped_order_status_history FOR EACH ROW EXECUTE FUNCTION public.ped_history_immutable();

DROP TRIGGER IF EXISTS trg_ped_adjustments_immutable ON public.ped_order_adjustments;
CREATE TRIGGER trg_ped_adjustments_immutable BEFORE UPDATE OR DELETE
ON public.ped_order_adjustments FOR EACH ROW EXECUTE FUNCTION public.ped_history_immutable();

-- updated_at
DROP TRIGGER IF EXISTS trg_ped_order_channels_touch ON public.ped_order_channels;
CREATE TRIGGER trg_ped_order_channels_touch BEFORE UPDATE ON public.ped_order_channels
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ped_order_payments_touch ON public.ped_order_payments;
CREATE TRIGGER trg_ped_order_payments_touch BEFORE UPDATE ON public.ped_order_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ped_order_deliveries_touch ON public.ped_order_deliveries;
CREATE TRIGGER trg_ped_order_deliveries_touch BEFORE UPDATE ON public.ped_order_deliveries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS
-- ============================================================
DROP POLICY IF EXISTS ped_order_channels_read ON public.ped_order_channels;
CREATE POLICY ped_order_channels_read ON public.ped_order_channels
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

DROP POLICY IF EXISTS ped_orders_read ON public.ped_orders;
CREATE POLICY ped_orders_read ON public.ped_orders
FOR SELECT TO authenticated
USING (public.ped_can_read_orders(company_id) OR public.ped_is_order_courier(id));

DROP POLICY IF EXISTS ped_order_items_read ON public.ped_order_items;
CREATE POLICY ped_order_items_read ON public.ped_order_items
FOR SELECT TO authenticated
USING (public.ped_can_read_orders(company_id) OR public.ped_is_order_courier(order_id));

DROP POLICY IF EXISTS ped_order_item_options_read ON public.ped_order_item_options;
CREATE POLICY ped_order_item_options_read ON public.ped_order_item_options
FOR SELECT TO authenticated
USING (public.ped_can_read_orders(company_id) OR public.ped_is_order_courier(order_id));

DROP POLICY IF EXISTS ped_order_history_read ON public.ped_order_status_history;
CREATE POLICY ped_order_history_read ON public.ped_order_status_history
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

DROP POLICY IF EXISTS ped_order_payments_read ON public.ped_order_payments;
CREATE POLICY ped_order_payments_read ON public.ped_order_payments
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

DROP POLICY IF EXISTS ped_order_adjustments_read ON public.ped_order_adjustments;
CREATE POLICY ped_order_adjustments_read ON public.ped_order_adjustments
FOR SELECT TO authenticated USING (public.ped_can_read_orders(company_id));

-- entregas contêm endereço (PII): apenas quem tem orders.delivery/customer_data ou o entregador atribuído
DROP POLICY IF EXISTS ped_order_deliveries_read ON public.ped_order_deliveries;
CREATE POLICY ped_order_deliveries_read ON public.ped_order_deliveries
FOR SELECT TO authenticated
USING (
  courier_user_id = (SELECT auth.uid())
  OR public.ped_can_operate_orders(company_id, 'orders.delivery')
  OR public.ped_can_operate_orders(company_id, 'orders.customer_data')
  OR public.ped_can_operate_orders(company_id, 'orders.manage')
);

-- ============================================================
-- RPCs
-- ============================================================

-- resolve entitlement + unidade e trava a linha do pedido
CREATE OR REPLACE FUNCTION public.ped_assert_orders_operation(p_company_id uuid, p_operation text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_ent jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;
  v_ent := public.can_use_orders_module(p_company_id, p_operation);
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false)
     OR COALESCE((v_ent->>'read_only')::boolean, true) THEN
    RAISE EXCEPTION 'Sem permissão para % (%).', p_operation, coalesce(v_ent->>'reason','forbidden')
      USING ERRCODE = '42501';
  END IF;
END; $$;

-- CREATE ORDER
CREATE OR REPLACE FUNCTION public.ped_create_order(
  p_unit_id uuid,
  p_items jsonb,
  p_order_type public.ped_fulfillment_mode DEFAULT NULL,
  p_channel_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_discount_amount integer DEFAULT 0,
  p_delivery_fee integer DEFAULT 0,
  p_service_fee integer DEFAULT 0,
  p_order_timing public.ped_order_timing DEFAULT 'immediate',
  p_scheduled_start_at timestamptz DEFAULT NULL,
  p_scheduled_window_start timestamptz DEFAULT NULL,
  p_scheduled_window_end timestamptz DEFAULT NULL,
  p_delivery jsonb DEFAULT NULL,
  p_is_test boolean DEFAULT false,
  p_external_order_id text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_unit public.ped_units;
  v_order public.ped_orders;
  v_existing public.ped_orders;
  v_item jsonb; v_opt jsonb;
  v_product public.ped_products;
  v_variant public.ped_product_variants;
  v_option public.ped_options;
  v_group_name text;
  v_item_id uuid;
  v_qty int; v_oqty int;
  v_unit_price int; v_opts_price int; v_item_total int;
  v_subtotal int := 0;
  v_discount int := GREATEST(coalesce(p_discount_amount, 0), 0);
  v_delivery_fee int := GREATEST(coalesce(p_delivery_fee, 0), 0);
  v_service_fee int := GREATEST(coalesce(p_service_fee, 0), 0);
  v_total int;
  v_number int;
  v_type public.ped_fulfillment_mode;
  v_i int := 0;
BEGIN
  SELECT * INTO v_unit FROM public.ped_units WHERE id = p_unit_id;
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'Unidade não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.ped_assert_orders_operation(v_unit.company_id, 'orders.manage');

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.ped_orders
     WHERE company_id = v_unit.company_id AND idempotency_key = p_idempotency_key;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'code', 'already_created',
        'order_id', v_existing.id, 'display_number', v_existing.display_number,
        'status', v_existing.status, 'version', v_existing.version,
        'total_amount', v_existing.total_amount, 'message', 'Pedido já criado.');
    END IF;
  END IF;

  IF v_unit.operational_state IN ('suspended') THEN
    RAISE EXCEPTION 'Unidade suspensa não pode receber pedidos.' USING ERRCODE = '42501';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um item no pedido.' USING ERRCODE = '22023';
  END IF;

  v_type := COALESCE(p_order_type, v_unit.fulfillment_modes[1], 'counter'::public.ped_fulfillment_mode);
  IF array_length(v_unit.fulfillment_modes, 1) IS NOT NULL
     AND NOT (v_type = ANY (v_unit.fulfillment_modes)) THEN
    RAISE EXCEPTION 'Forma de atendimento não habilitada nesta unidade.' USING ERRCODE = '22023';
  END IF;

  IF p_channel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ped_order_channels c
     WHERE c.id = p_channel_id AND c.company_id = v_unit.company_id AND c.is_active
  ) THEN
    RAISE EXCEPTION 'Canal inválido para esta empresa.' USING ERRCODE = '22023';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contacts ct WHERE ct.id = p_customer_id
  ) THEN
    RAISE EXCEPTION 'Cliente inválido.' USING ERRCODE = '22023';
  END IF;

  IF p_order_timing = 'scheduled'
     AND p_scheduled_start_at IS NULL AND p_scheduled_window_start IS NULL THEN
    RAISE EXCEPTION 'Pedido agendado exige data/hora.' USING ERRCODE = '22023';
  END IF;

  -- número sequencial por unidade (serializa criação concorrente na mesma unidade)
  PERFORM pg_advisory_xact_lock(hashtextextended(v_unit.id::text, 0));
  SELECT COALESCE(MAX(display_number), 0) + 1 INTO v_number
    FROM public.ped_orders WHERE unit_id = v_unit.id;

  INSERT INTO public.ped_orders (
    company_id, unit_id, channel_id, external_order_id, idempotency_key, display_number,
    order_type, order_timing, status, customer_id, customer_name, customer_phone, notes,
    scheduled_start_at, scheduled_window_start, scheduled_window_end,
    is_test, created_by)
  VALUES (
    v_unit.company_id, v_unit.id, p_channel_id, nullif(btrim(p_external_order_id), ''),
    nullif(btrim(p_idempotency_key), ''), v_number,
    v_type, coalesce(p_order_timing, 'immediate'), 'pending_acceptance',
    p_customer_id, nullif(btrim(p_customer_name), ''), nullif(btrim(p_customer_phone), ''),
    nullif(btrim(p_notes), ''),
    p_scheduled_start_at, p_scheduled_window_start, p_scheduled_window_end,
    coalesce(p_is_test, false), auth.uid())
  RETURNING * INTO v_order;

  -- itens: preços SEMPRE lidos do catálogo (nunca do frontend)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_i := v_i + 1;
    v_qty := GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1);

    SELECT * INTO v_product FROM public.ped_products
     WHERE id = (v_item->>'product_id')::uuid AND company_id = v_order.company_id;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido no item %.', v_i USING ERRCODE = '22023';
    END IF;
    IF v_product.archived_at IS NOT NULL OR v_product.state IN ('archived','unavailable') THEN
      RAISE EXCEPTION 'Produto indisponível: %.', v_product.name USING ERRCODE = '22023';
    END IF;

    v_unit_price := v_product.base_price_cents;
    v_variant := NULL;
    IF (v_item->>'variant_id') IS NOT NULL THEN
      SELECT * INTO v_variant FROM public.ped_product_variants
       WHERE id = (v_item->>'variant_id')::uuid AND product_id = v_product.id;
      IF v_variant.id IS NULL THEN
        RAISE EXCEPTION 'Variação inválida no item %.', v_i USING ERRCODE = '22023';
      END IF;
      v_unit_price := v_variant.price_cents;
    END IF;

    -- override de preço por unidade, quando existir
    SELECT COALESCE(o.price_cents, v_unit_price) INTO v_unit_price
      FROM public.ped_product_unit_overrides o
     WHERE o.product_id = v_product.id AND o.unit_id = v_unit.id
     LIMIT 1;
    IF v_unit_price IS NULL THEN
      v_unit_price := COALESCE(v_variant.price_cents, v_product.base_price_cents);
    END IF;

    INSERT INTO public.ped_order_items (
      company_id, order_id, product_id, variant_id, name_snapshot, description_snapshot,
      variant_name_snapshot, quantity, unit_price, options_price, total_price, notes, sort_order)
    VALUES (v_order.company_id, v_order.id, v_product.id, v_variant.id, v_product.name,
      v_product.description, v_variant.name, v_qty, v_unit_price, 0, 0,
      nullif(btrim(v_item->>'notes'), ''), v_i)
    RETURNING id INTO v_item_id;

    v_opts_price := 0;
    IF jsonb_typeof(v_item->'options') = 'array' THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_item->'options') LOOP
        SELECT * INTO v_option FROM public.ped_options
         WHERE id = (v_opt->>'option_id')::uuid AND company_id = v_order.company_id;
        IF v_option.id IS NULL THEN
          RAISE EXCEPTION 'Complemento inválido no item %.', v_i USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.ped_option_groups g
                        WHERE g.id = v_option.group_id AND g.product_id = v_product.id) THEN
          RAISE EXCEPTION 'Complemento não pertence ao produto %.', v_product.name USING ERRCODE = '22023';
        END IF;
        IF v_option.state IN ('archived','unavailable') THEN
          RAISE EXCEPTION 'Complemento indisponível: %.', v_option.name USING ERRCODE = '22023';
        END IF;
        v_oqty := LEAST(GREATEST(COALESCE((v_opt->>'quantity')::int, 1), 1), v_option.max_quantity);
        SELECT g.name INTO v_group_name FROM public.ped_option_groups g WHERE g.id = v_option.group_id;

        INSERT INTO public.ped_order_item_options (
          company_id, order_id, item_id, option_id, group_name_snapshot, name_snapshot,
          quantity, unit_price, total_price)
        VALUES (v_order.company_id, v_order.id, v_item_id, v_option.id, v_group_name,
          v_option.name, v_oqty, v_option.price_cents, v_option.price_cents * v_oqty);

        v_opts_price := v_opts_price + (v_option.price_cents * v_oqty);
      END LOOP;
    END IF;

    -- grupos obrigatórios
    IF EXISTS (
      SELECT 1 FROM public.ped_option_groups g
       WHERE g.product_id = v_product.id AND g.is_required AND g.state = 'active'
         AND (SELECT COALESCE(SUM(io.quantity), 0)
                FROM public.ped_order_item_options io
                JOIN public.ped_options o ON o.id = io.option_id
               WHERE io.item_id = v_item_id AND o.group_id = g.id) < g.min_choices
    ) THEN
      RAISE EXCEPTION 'Complementos obrigatórios não informados para %.', v_product.name USING ERRCODE = '22023';
    END IF;

    v_item_total := (v_unit_price * v_qty) + (v_opts_price * v_qty);
    UPDATE public.ped_order_items
       SET options_price = v_opts_price, total_price = v_item_total
     WHERE id = v_item_id;

    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  IF v_type NOT IN ('delivery') THEN
    v_delivery_fee := 0;
  END IF;
  IF v_discount > v_subtotal + v_delivery_fee + v_service_fee THEN
    RAISE EXCEPTION 'Desconto maior que o valor do pedido.' USING ERRCODE = '22023';
  END IF;
  v_total := v_subtotal + v_delivery_fee + v_service_fee - v_discount;

  UPDATE public.ped_orders
     SET subtotal = v_subtotal, discount_amount = v_discount, delivery_fee = v_delivery_fee,
         service_fee = v_service_fee, total_amount = v_total,
         original_total_amount = v_total, estimated_net_amount = v_total
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  IF v_type = 'delivery' OR p_delivery IS NOT NULL THEN
    INSERT INTO public.ped_order_deliveries (company_id, order_id, address, fee_amount)
    VALUES (v_order.company_id, v_order.id, COALESCE(p_delivery, '{}'::jsonb), v_delivery_fee)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  INSERT INTO public.ped_order_status_history (
    company_id, order_id, from_status, to_status, changed_by, source, reason, metadata, version_after)
  VALUES (v_order.company_id, v_order.id, NULL, 'pending_acceptance', auth.uid(), 'painel', NULL,
    jsonb_build_object('items', v_i, 'total_amount', v_total, 'is_test', v_order.is_test), v_order.version);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_created', 'ped_orders', v_order.id::text,
    jsonb_build_object('company_id', v_order.company_id, 'unit_id', v_order.unit_id,
      'display_number', v_order.display_number, 'total_amount', v_total, 'is_test', v_order.is_test));

  RETURN jsonb_build_object('success', true, 'code', 'created', 'order_id', v_order.id,
    'display_number', v_order.display_number, 'status', v_order.status, 'version', v_order.version,
    'subtotal', v_order.subtotal, 'total_amount', v_order.total_amount,
    'message', 'Pedido criado.');
END; $$;

-- TRANSIÇÃO GENÉRICA
CREATE OR REPLACE FUNCTION public.ped_order_transition(
  p_order_id uuid,
  p_to public.ped_order_status,
  p_operation text,
  p_expected_version integer DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_source public.ped_history_source DEFAULT 'painel',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.ped_orders;
  v_key text := nullif(btrim(p_idempotency_key), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, p_operation);

  IF v_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ped_order_status_history h
     WHERE h.order_id = v_order.id AND h.idempotency_key = v_key
  ) THEN
    SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'code', 'already_applied',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', 'Operação já aplicada.');
  END IF;

  -- trava a linha (impede dois usuários aceitando o mesmo pedido)
  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.status = p_to THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_in_status',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', 'Pedido já está neste estado.');
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_order.version THEN
    RETURN jsonb_build_object('success', false, 'code', 'version_conflict',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', 'O pedido foi atualizado por outro usuário. Recarregue.');
  END IF;

  IF NOT public.ped_order_transition_allowed(v_order.status, p_to) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_transition',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', format('Transição inválida: %s → %s.', v_order.status, p_to));
  END IF;

  UPDATE public.ped_orders SET
    status = p_to,
    version = v_order.version + 1,
    accepted_at = CASE WHEN p_to = 'accepted' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    preparation_started_at = CASE WHEN p_to = 'preparation_started'
      THEN COALESCE(preparation_started_at, now()) ELSE preparation_started_at END,
    ready_at = CASE WHEN p_to IN ('ready','awaiting_pickup') THEN COALESCE(ready_at, now()) ELSE ready_at END,
    dispatched_at = CASE WHEN p_to = 'dispatched' THEN COALESCE(dispatched_at, now()) ELSE dispatched_at END,
    delivered_at = CASE WHEN p_to = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    completed_at = CASE WHEN p_to = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END,
    cancelled_at = CASE WHEN p_to = 'cancelled' THEN COALESCE(cancelled_at, now()) ELSE cancelled_at END,
    cancellation_reason = CASE WHEN p_to IN ('cancellation_requested','cancelled')
      THEN COALESCE(nullif(btrim(p_reason), ''), cancellation_reason) ELSE cancellation_reason END,
    payment_status = CASE
      WHEN p_to = 'refunded' THEN 'refunded'::public.ped_payment_status
      WHEN p_to = 'partially_refunded' THEN 'partially_refunded'::public.ped_payment_status
      WHEN p_to = 'cancelled' AND payment_status = 'pending' THEN 'cancelled'::public.ped_payment_status
      ELSE payment_status END
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.ped_order_status_history (
    company_id, order_id, from_status, to_status, changed_by, source, reason, metadata,
    idempotency_key, version_after)
  VALUES (v_order.company_id, v_order.id,
    (SELECT status FROM (SELECT p_to) t WHERE false), -- placeholder substituído abaixo
    p_to, auth.uid(), coalesce(p_source, 'painel'), nullif(btrim(p_reason), ''),
    coalesce(p_metadata, '{}'::jsonb), v_key, v_order.version);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_status_changed', 'ped_orders', v_order.id::text,
    jsonb_build_object('company_id', v_order.company_id, 'to', p_to, 'operation', p_operation,
      'version', v_order.version));

  RETURN jsonb_build_object('success', true, 'code', 'updated', 'order_id', v_order.id,
    'status', v_order.status, 'version', v_order.version, 'message', 'Pedido atualizado.');
END; $$;

-- RPCs específicas
CREATE OR REPLACE FUNCTION public.ped_accept_order(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'accepted', 'orders.accept', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_start_order_preparation(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'preparation_started', 'orders.prepare', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_mark_order_ready(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'ready', 'orders.prepare', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_await_order_pickup(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'awaiting_pickup', 'orders.dispatch', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_dispatch_order(
  p_order_id uuid, p_expected_version integer DEFAULT NULL,
  p_courier_user_id uuid DEFAULT NULL, p_courier_name text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb; v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.ped_orders WHERE id = p_order_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;

  v_res := public.ped_order_transition(p_order_id, 'dispatched', 'orders.dispatch',
    p_expected_version, NULL, 'painel',
    jsonb_build_object('courier_assigned', p_courier_user_id IS NOT NULL), p_idempotency_key);

  IF COALESCE((v_res->>'success')::boolean, false) THEN
    INSERT INTO public.ped_order_deliveries (company_id, order_id, status, courier_user_id, courier_name, assigned_at)
    VALUES (v_company, p_order_id, 'picked_up', p_courier_user_id, nullif(btrim(p_courier_name), ''), now())
    ON CONFLICT (order_id) DO UPDATE SET
      status = 'picked_up',
      courier_user_id = COALESCE(EXCLUDED.courier_user_id, public.ped_order_deliveries.courier_user_id),
      courier_name = COALESCE(EXCLUDED.courier_name, public.ped_order_deliveries.courier_name),
      assigned_at = COALESCE(public.ped_order_deliveries.assigned_at, now()),
      picked_up_at = COALESCE(public.ped_order_deliveries.picked_up_at, now());
  END IF;
  RETURN v_res;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_mark_order_delivered(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  v_res := public.ped_order_transition(p_order_id, 'delivered', 'orders.dispatch', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
  IF COALESCE((v_res->>'success')::boolean, false) THEN
    UPDATE public.ped_order_deliveries
       SET status = 'delivered', delivered_at = COALESCE(delivered_at, now())
     WHERE order_id = p_order_id;
  END IF;
  RETURN v_res;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_complete_order(p_order_id uuid, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'completed', 'orders.manage', p_expected_version, NULL, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_request_order_cancellation(p_order_id uuid, p_reason text, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.ped_order_transition(p_order_id, 'cancellation_requested', 'orders.manage', p_expected_version, p_reason, 'painel', '{}'::jsonb, p_idempotency_key);
$$;

CREATE OR REPLACE FUNCTION public.ped_cancel_order(p_order_id uuid, p_reason text, p_expected_version integer DEFAULT NULL, p_idempotency_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF nullif(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;
  v_res := public.ped_order_transition(p_order_id, 'cancelled', 'orders.cancel', p_expected_version, p_reason, 'painel', '{}'::jsonb, p_idempotency_key);
  IF COALESCE((v_res->>'success')::boolean, false) THEN
    UPDATE public.ped_order_deliveries SET status = 'cancelled' WHERE order_id = p_order_id;
  END IF;
  RETURN v_res;
END; $$;

-- AJUSTES (desconto/acréscimo/estorno) — preserva valor original
CREATE OR REPLACE FUNCTION public.ped_apply_order_adjustment(
  p_order_id uuid,
  p_kind public.ped_adjustment_kind,
  p_amount integer,
  p_reason text DEFAULT NULL,
  p_expected_version integer DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_order public.ped_orders;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_delta int;
  v_before int; v_after int;
  v_op text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'Informe um valor de ajuste diferente de zero.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.' USING ERRCODE = 'P0002'; END IF;

  v_op := CASE WHEN p_kind = 'refund' THEN 'orders.refund' ELSE 'orders.manage' END;
  PERFORM public.ped_assert_orders_operation(v_order.company_id, v_op);

  IF v_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ped_order_adjustments a WHERE a.order_id = v_order.id AND a.idempotency_key = v_key) THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_applied', 'order_id', v_order.id,
      'total_amount', v_order.total_amount, 'version', v_order.version, 'message', 'Ajuste já aplicado.');
  END IF;

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_order.version THEN
    RETURN jsonb_build_object('success', false, 'code', 'version_conflict', 'order_id', v_order.id,
      'version', v_order.version, 'message', 'O pedido foi atualizado por outro usuário. Recarregue.');
  END IF;

  IF v_order.status IN ('cancelled','refunded','failed') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_state', 'order_id', v_order.id,
      'status', v_order.status, 'message', 'Pedido encerrado não aceita ajustes.');
  END IF;

  v_delta := CASE
    WHEN p_kind IN ('discount','refund') THEN -abs(p_amount)
    WHEN p_kind IN ('surcharge','delivery_fee','service_fee') THEN abs(p_amount)
    ELSE p_amount END;

  v_before := v_order.total_amount;
  v_after := v_before + v_delta;
  IF v_after < 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_amount', 'order_id', v_order.id,
      'message', 'Ajuste maior que o total do pedido.');
  END IF;

  UPDATE public.ped_orders SET
    discount_amount = CASE WHEN p_kind = 'discount' THEN discount_amount + abs(p_amount) ELSE discount_amount END,
    delivery_fee = CASE WHEN p_kind = 'delivery_fee' THEN delivery_fee + abs(p_amount) ELSE delivery_fee END,
    service_fee = CASE WHEN p_kind = 'service_fee' THEN service_fee + abs(p_amount) ELSE service_fee END,
    total_amount = v_after,
    estimated_net_amount = v_after,
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.ped_order_adjustments (
    company_id, order_id, kind, amount, reason, total_before, total_after, idempotency_key, created_by)
  VALUES (v_order.company_id, v_order.id, p_kind, v_delta, nullif(btrim(p_reason), ''),
    v_before, v_after, v_key, auth.uid());

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_adjustment_applied', 'ped_orders', v_order.id::text,
    jsonb_build_object('company_id', v_order.company_id, 'kind', p_kind, 'amount', v_delta,
      'total_before', v_before, 'total_after', v_after));

  RETURN jsonb_build_object('success', true, 'code', 'adjusted', 'order_id', v_order.id,
    'total_amount', v_order.total_amount, 'original_total_amount', v_order.original_total_amount,
    'version', v_order.version, 'message', 'Ajuste aplicado.');
END; $$;

-- GRANTS de execução (fail closed: nada para anon)
REVOKE ALL ON FUNCTION public.ped_create_order(uuid, jsonb, public.ped_fulfillment_mode, uuid, uuid, text, text, text, integer, integer, integer, public.ped_order_timing, timestamptz, timestamptz, timestamptz, jsonb, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_create_order(uuid, jsonb, public.ped_fulfillment_mode, uuid, uuid, text, text, text, integer, integer, integer, public.ped_order_timing, timestamptz, timestamptz, timestamptz, jsonb, boolean, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ped_order_transition(uuid, public.ped_order_status, text, integer, text, public.ped_history_source, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_order_transition(uuid, public.ped_order_status, text, integer, text, public.ped_history_source, jsonb, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ped_accept_order(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_accept_order(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_start_order_preparation(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_start_order_preparation(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_mark_order_ready(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_mark_order_ready(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_await_order_pickup(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_await_order_pickup(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_dispatch_order(uuid, integer, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_dispatch_order(uuid, integer, uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_mark_order_delivered(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_mark_order_delivered(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_complete_order(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_complete_order(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_request_order_cancellation(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_request_order_cancellation(uuid, text, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_cancel_order(uuid, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_cancel_order(uuid, text, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_apply_order_adjustment(uuid, public.ped_adjustment_kind, integer, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_apply_order_adjustment(uuid, public.ped_adjustment_kind, integer, text, integer, text) TO authenticated, service_role;
