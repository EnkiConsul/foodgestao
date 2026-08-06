-- =========================================================
-- Loja online própria do módulo Pedidos (storefront)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.ped_storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL UNIQUE REFERENCES public.ped_units(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  theme text NOT NULL DEFAULT 'classic',
  primary_color text NOT NULL DEFAULT '#EB6119',
  logo_url text,
  banner_url text,
  headline text,
  about text,
  whatsapp_phone text,
  online_cart_enabled boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ped_storefronts_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  CONSTRAINT ped_storefronts_theme_valid CHECK (theme IN ('classic','bold','minimal')),
  CONSTRAINT ped_storefronts_color_valid CHECK (primary_color ~* '^#[0-9a-f]{6}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ped_storefronts TO authenticated;
GRANT ALL ON public.ped_storefronts TO service_role;

ALTER TABLE public.ped_storefronts ENABLE ROW LEVEL SECURITY;

CREATE POLICY storefronts_read ON public.ped_storefronts
  FOR SELECT TO authenticated
  USING (public.ped_can_read_catalog(company_id));

CREATE POLICY storefronts_write ON public.ped_storefronts
  FOR ALL TO authenticated
  USING (public.ped_can_edit_catalog(company_id))
  WITH CHECK (public.ped_can_edit_catalog(company_id));

CREATE INDEX IF NOT EXISTS ped_storefronts_company_idx ON public.ped_storefronts(company_id);

CREATE TRIGGER ped_storefronts_touch
  BEFORE UPDATE ON public.ped_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.ped_catalog_touch();

-- garante que company_id corresponde à unidade
CREATE OR REPLACE FUNCTION public.ped_storefront_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.ped_units WHERE id = NEW.unit_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Unidade inválida.' USING ERRCODE = '22023';
  END IF;
  NEW.company_id := v_company;
  NEW.slug := lower(btrim(NEW.slug));
  IF NEW.is_published AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER ped_storefront_guard_trg
  BEFORE INSERT OR UPDATE ON public.ped_storefronts
  FOR EACH ROW EXECUTE FUNCTION public.ped_storefront_guard();

-- =========================================================
-- Disponibilidade de slug (usuário autenticado)
-- =========================================================
CREATE OR REPLACE FUNCTION public.storefront_slug_available(p_slug text, p_unit_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.ped_storefronts s
     WHERE s.slug = lower(btrim(p_slug))
       AND (p_unit_id IS NULL OR s.unit_id <> p_unit_id)
  ) AND lower(btrim(p_slug)) ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$';
$$;

GRANT EXECUTE ON FUNCTION public.storefront_slug_available(text, uuid) TO authenticated;

-- =========================================================
-- Leitura pública da loja + cardápio
-- =========================================================
CREATE OR REPLACE FUNCTION public.storefront_public_get(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.ped_storefronts;
  v_unit public.ped_units;
  v_company record;
  v_menu_id uuid;
  v_result jsonb;
BEGIN
  SELECT * INTO v_store FROM public.ped_storefronts
   WHERE slug = lower(btrim(p_slug)) AND is_published;
  IF v_store.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_store.unit_id;
  SELECT c.name, c.trade_name INTO v_company FROM public.companies c WHERE c.id = v_store.company_id;

  SELECT m.id INTO v_menu_id FROM public.ped_menus m
   WHERE m.company_id = v_store.company_id
     AND (m.unit_id = v_unit.id OR m.unit_id IS NULL)
     AND m.state = 'active' AND m.archived_at IS NULL
   ORDER BY (m.unit_id = v_unit.id) DESC, m.is_default DESC, m.sort_order, m.created_at
   LIMIT 1;

  v_result := jsonb_build_object(
    'found', true,
    'store', jsonb_build_object(
      'slug', v_store.slug, 'theme', v_store.theme, 'primary_color', v_store.primary_color,
      'logo_url', v_store.logo_url, 'banner_url', v_store.banner_url,
      'headline', v_store.headline, 'about', v_store.about,
      'whatsapp_phone', v_store.whatsapp_phone,
      'online_cart_enabled', v_store.online_cart_enabled
    ),
    'unit', jsonb_build_object(
      'id', v_unit.id,
      'name', COALESCE(NULLIF(v_company.trade_name, ''), v_company.name),
      'timezone', v_unit.timezone,
      'state', v_unit.operational_state,
      'prep_time_minutes', v_unit.prep_time_minutes,
      'fulfillment_modes', to_jsonb(v_unit.fulfillment_modes),
      'min_order_amount', COALESCE(v_unit.min_order_amount, 0),
      'service_fee_percent', COALESCE(v_unit.service_fee_percent, 0),
      'scheduled_orders_enabled', v_unit.scheduled_orders_enabled
    ),
    'hours', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', h.opens_at, 'closes_at', h.closes_at)
                       ORDER BY h.weekday, h.opens_at)
        FROM public.ped_unit_hours h WHERE h.unit_id = v_unit.id), '[]'::jsonb),
    'exceptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('exception_date', e.exception_date, 'is_closed', e.is_closed,
                                          'opens_at', e.opens_at, 'closes_at', e.closes_at, 'note', e.note))
        FROM public.ped_unit_hour_exceptions e
       WHERE e.unit_id = v_unit.id AND e.exception_date >= (now() - interval '1 day')::date), '[]'::jsonb),
    'zones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name, 'fee_amount', z.fee_amount,
                                          'min_order_amount', z.min_order_amount, 'eta_minutes', z.eta_minutes,
                                          'bairros', to_jsonb(z.bairros))
                       ORDER BY z.sort_order, z.name)
        FROM public.ped_delivery_zones z WHERE z.unit_id = v_unit.id AND z.is_active), '[]'::jsonb),
    'payment_options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'label', p.label)
                       ORDER BY p.label)
        FROM public.ped_unit_payment_options p WHERE p.unit_id = v_unit.id AND p.is_active), '[]'::jsonb),
    'categories', COALESCE((
      SELECT jsonb_agg(cat ORDER BY (cat->>'sort_order')::int, cat->>'name') FROM (
        SELECT jsonb_build_object(
          'id', c.id, 'name', c.name, 'description', c.description, 'sort_order', c.sort_order,
          'products', COALESCE((
            SELECT jsonb_agg(prod ORDER BY (prod->>'sort_order')::int, prod->>'name') FROM (
              SELECT jsonb_build_object(
                'id', pr.id, 'name', pr.name, 'description', pr.description,
                'image_path', pr.image_path, 'sort_order', pr.sort_order,
                'allows_notes', pr.allows_notes,
                'price_cents', COALESCE(
                  (SELECT o.price_cents FROM public.ped_product_unit_overrides o
                    WHERE o.product_id = pr.id AND o.unit_id = v_unit.id LIMIT 1),
                  pr.base_price_cents),
                'available', (pr.state = 'active'
                              AND (pr.paused_until IS NULL OR pr.paused_until < now())
                              AND NOT EXISTS (SELECT 1 FROM public.ped_product_unit_overrides o2
                                               WHERE o2.product_id = pr.id AND o2.unit_id = v_unit.id
                                                 AND o2.state IN ('unavailable','archived'))),
                'variants', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price_cents', v.price_cents,
                                                      'is_default', v.is_default)
                                   ORDER BY v.sort_order, v.name)
                    FROM public.ped_product_variants v
                   WHERE v.product_id = pr.id AND v.state = 'active'), '[]'::jsonb),
                'option_groups', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'is_required', g.is_required,
                                                      'min_choices', g.min_choices, 'max_choices', g.max_choices,
                    'options', COALESCE((
                      SELECT jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'description', op.description,
                                                          'price_cents', op.price_cents, 'max_quantity', op.max_quantity)
                                       ORDER BY op.sort_order, op.name)
                        FROM public.ped_options op WHERE op.group_id = g.id AND op.state = 'active'), '[]'::jsonb))
                                   ORDER BY g.sort_order, g.name)
                    FROM public.ped_option_groups g
                   WHERE g.product_id = pr.id AND g.state = 'active'), '[]'::jsonb)
              ) AS prod
                FROM public.ped_products pr
               WHERE pr.category_id = c.id AND pr.archived_at IS NULL AND pr.state <> 'archived'
            ) p2), '[]'::jsonb)
        ) AS cat
          FROM public.ped_menu_categories c
         WHERE c.menu_id = v_menu_id AND c.state = 'active' AND c.archived_at IS NULL
      ) c2), '[]'::jsonb)
  );

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.storefront_public_get(text) TO anon, authenticated;

-- =========================================================
-- Criação pública de pedido
-- =========================================================
CREATE OR REPLACE FUNCTION public.storefront_public_create_order(
  p_slug text,
  p_items jsonb,
  p_order_type text,
  p_customer_name text,
  p_customer_phone text,
  p_notes text DEFAULT NULL,
  p_zone_id uuid DEFAULT NULL,
  p_address jsonb DEFAULT NULL,
  p_payment_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.ped_storefronts;
  v_unit public.ped_units;
  v_type public.ped_fulfillment_mode;
  v_zone public.ped_delivery_zones;
  v_channel_id uuid;
  v_order public.ped_orders;
  v_item jsonb; v_opt jsonb;
  v_product public.ped_products;
  v_variant public.ped_product_variants;
  v_option public.ped_options;
  v_group_name text;
  v_item_id uuid;
  v_qty int; v_oqty int;
  v_unit_price int; v_opts_price int; v_item_total int;
  v_subtotal int := 0;
  v_delivery_fee int := 0;
  v_service_fee int := 0;
  v_total int;
  v_number int;
  v_i int := 0;
  v_phone text := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_name text := btrim(COALESCE(p_customer_name, ''));
  v_now timestamptz := now();
  v_local timestamp;
  v_open boolean := false;
  v_exception public.ped_unit_hour_exceptions;
BEGIN
  SELECT * INTO v_store FROM public.ped_storefronts
   WHERE slug = lower(btrim(p_slug)) AND is_published;
  IF v_store.id IS NULL THEN
    RAISE EXCEPTION 'Loja não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT v_store.online_cart_enabled THEN
    RAISE EXCEPTION 'Esta loja não aceita pedidos online.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unit FROM public.ped_units WHERE id = v_store.unit_id;
  IF v_unit.operational_state <> 'open' THEN
    RAISE EXCEPTION 'A loja está fechada no momento.' USING ERRCODE = '42501';
  END IF;

  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Informe seu nome.' USING ERRCODE = '22023';
  END IF;
  IF length(v_phone) < 10 OR length(v_phone) > 13 THEN
    RAISE EXCEPTION 'Informe um telefone válido com DDD.' USING ERRCODE = '22023';
  END IF;

  -- anti-abuso: 5 pedidos por telefone/unidade a cada 10 minutos
  IF (SELECT count(*) FROM public.ped_orders o
       WHERE o.unit_id = v_unit.id
         AND regexp_replace(COALESCE(o.customer_phone, ''), '[^0-9]', '', 'g') = v_phone
         AND o.created_at > v_now - interval '10 minutes') >= 5 THEN
    RAISE EXCEPTION 'Muitos pedidos em sequência. Aguarde alguns minutos.' USING ERRCODE = '42901';
  END IF;

  -- horário de funcionamento
  v_local := v_now AT TIME ZONE COALESCE(v_unit.timezone, 'America/Sao_Paulo');
  SELECT * INTO v_exception FROM public.ped_unit_hour_exceptions e
   WHERE e.unit_id = v_unit.id AND e.exception_date = v_local::date;
  IF v_exception.id IS NOT NULL THEN
    v_open := NOT v_exception.is_closed
              AND v_exception.opens_at IS NOT NULL
              AND v_local::time BETWEEN v_exception.opens_at AND v_exception.closes_at;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.ped_unit_hours h
       WHERE h.unit_id = v_unit.id
         AND h.weekday = EXTRACT(DOW FROM v_local)::int
         AND v_local::time BETWEEN h.opens_at AND h.closes_at
    ) INTO v_open;
  END IF;
  IF NOT v_open THEN
    RAISE EXCEPTION 'A loja está fora do horário de atendimento.' USING ERRCODE = '42501';
  END IF;

  v_type := COALESCE(NULLIF(p_order_type, '')::public.ped_fulfillment_mode,
                     v_unit.fulfillment_modes[1], 'counter'::public.ped_fulfillment_mode);
  IF array_length(v_unit.fulfillment_modes, 1) IS NOT NULL
     AND NOT (v_type = ANY (v_unit.fulfillment_modes)) THEN
    RAISE EXCEPTION 'Forma de atendimento não disponível.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Seu carrinho está vazio.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 60 THEN
    RAISE EXCEPTION 'Muitos itens no pedido.' USING ERRCODE = '22023';
  END IF;

  IF v_type = 'delivery' THEN
    IF p_zone_id IS NULL THEN
      RAISE EXCEPTION 'Selecione a região de entrega.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_zone FROM public.ped_delivery_zones
     WHERE id = p_zone_id AND unit_id = v_unit.id AND is_active;
    IF v_zone.id IS NULL THEN
      RAISE EXCEPTION 'Região de entrega inválida.' USING ERRCODE = '22023';
    END IF;
    v_delivery_fee := v_zone.fee_amount;
    IF p_address IS NULL OR COALESCE(btrim(p_address->>'street'), '') = '' THEN
      RAISE EXCEPTION 'Informe o endereço de entrega.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_payment_option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ped_unit_payment_options po
     WHERE po.id = p_payment_option_id AND po.unit_id = v_unit.id AND po.is_active
  ) THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT c.id INTO v_channel_id FROM public.ped_order_channels c
   WHERE c.company_id = v_unit.company_id AND c.is_active AND c.code = 'loja_propria'
   LIMIT 1;
  IF v_channel_id IS NULL THEN
    SELECT c.id INTO v_channel_id FROM public.ped_order_channels c
     WHERE c.company_id = v_unit.company_id AND c.is_active
     ORDER BY c.is_default DESC, c.created_at LIMIT 1;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_unit.id::text, 0));
  SELECT COALESCE(MAX(display_number), 0) + 1 INTO v_number
    FROM public.ped_orders WHERE unit_id = v_unit.id;

  INSERT INTO public.ped_orders (
    company_id, unit_id, channel_id, display_number, order_type, order_timing, status,
    customer_name, customer_phone, notes, is_test)
  VALUES (
    v_unit.company_id, v_unit.id, v_channel_id, v_number, v_type, 'immediate', 'pending_acceptance',
    v_name, v_phone, NULLIF(btrim(p_notes), ''), false)
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_i := v_i + 1;
    v_qty := LEAST(GREATEST(COALESCE((v_item->>'quantity')::int, 1), 1), 50);

    SELECT * INTO v_product FROM public.ped_products
     WHERE id = (v_item->>'product_id')::uuid AND company_id = v_order.company_id;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Produto inválido no item %.', v_i USING ERRCODE = '22023';
    END IF;
    IF v_product.archived_at IS NOT NULL OR v_product.state <> 'active'
       OR (v_product.paused_until IS NOT NULL AND v_product.paused_until > v_now) THEN
      RAISE EXCEPTION 'Produto indisponível: %.', v_product.name USING ERRCODE = '22023';
    END IF;

    v_unit_price := v_product.base_price_cents;
    v_variant := NULL;
    IF (v_item->>'variant_id') IS NOT NULL THEN
      SELECT * INTO v_variant FROM public.ped_product_variants
       WHERE id = (v_item->>'variant_id')::uuid AND product_id = v_product.id AND state = 'active';
      IF v_variant.id IS NULL THEN
        RAISE EXCEPTION 'Variação inválida no item %.', v_i USING ERRCODE = '22023';
      END IF;
      v_unit_price := v_variant.price_cents;
    END IF;

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
      CASE WHEN v_product.allows_notes THEN NULLIF(btrim(left(v_item->>'notes', 300)), '') END, v_i)
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
        IF v_option.state <> 'active' THEN
          RAISE EXCEPTION 'Complemento indisponível: %.', v_option.name USING ERRCODE = '22023';
        END IF;
        v_oqty := LEAST(GREATEST(COALESCE((v_opt->>'quantity')::int, 1), 1), GREATEST(v_option.max_quantity, 1));
        SELECT g.name INTO v_group_name FROM public.ped_option_groups g WHERE g.id = v_option.group_id;

        INSERT INTO public.ped_order_item_options (
          company_id, order_id, item_id, option_id, group_name_snapshot, name_snapshot,
          quantity, unit_price, total_price)
        VALUES (v_order.company_id, v_order.id, v_item_id, v_option.id, v_group_name,
          v_option.name, v_oqty, v_option.price_cents, v_option.price_cents * v_oqty);

        v_opts_price := v_opts_price + (v_option.price_cents * v_oqty);
      END LOOP;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ped_option_groups g
       WHERE g.product_id = v_product.id AND g.is_required AND g.state = 'active'
         AND (SELECT COALESCE(SUM(io.quantity), 0)
                FROM public.ped_order_item_options io
                JOIN public.ped_options o ON o.id = io.option_id
               WHERE io.item_id = v_item_id AND o.group_id = g.id) < g.min_choices
    ) THEN
      RAISE EXCEPTION 'Escolha os complementos obrigatórios de %.', v_product.name USING ERRCODE = '22023';
    END IF;

    v_item_total := (v_unit_price * v_qty) + (v_opts_price * v_qty);
    UPDATE public.ped_order_items
       SET options_price = v_opts_price, total_price = v_item_total
     WHERE id = v_item_id;

    v_subtotal := v_subtotal + v_item_total;
  END LOOP;

  IF v_type <> 'delivery' THEN
    v_delivery_fee := 0;
  END IF;

  IF COALESCE(v_unit.min_order_amount, 0) > 0 AND v_subtotal < v_unit.min_order_amount THEN
    RAISE EXCEPTION 'Pedido mínimo de R$ %.', to_char(v_unit.min_order_amount / 100.0, 'FM999999990.00')
      USING ERRCODE = '22023';
  END IF;
  IF v_zone.id IS NOT NULL AND COALESCE(v_zone.min_order_amount, 0) > 0
     AND v_subtotal < v_zone.min_order_amount THEN
    RAISE EXCEPTION 'Pedido mínimo desta região: R$ %.', to_char(v_zone.min_order_amount / 100.0, 'FM999999990.00')
      USING ERRCODE = '22023';
  END IF;

  v_service_fee := FLOOR(v_subtotal * COALESCE(v_unit.service_fee_percent, 0) / 100.0)::int;
  v_total := v_subtotal + v_delivery_fee + v_service_fee;

  UPDATE public.ped_orders
     SET subtotal = v_subtotal, delivery_fee = v_delivery_fee, service_fee = v_service_fee,
         total_amount = v_total, original_total_amount = v_total, estimated_net_amount = v_total
   WHERE id = v_order.id
   RETURNING * INTO v_order;

  IF v_type = 'delivery' THEN
    INSERT INTO public.ped_order_deliveries (company_id, order_id, address, fee_amount, zone_id, eta_minutes)
    VALUES (v_order.company_id, v_order.id, COALESCE(p_address, '{}'::jsonb), v_delivery_fee,
            v_zone.id, v_zone.eta_minutes)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  IF p_payment_option_id IS NOT NULL THEN
    INSERT INTO public.ped_order_payments (company_id, order_id, kind, payment_method_id, amount, status, is_online, note)
    SELECT v_order.company_id, v_order.id, po.kind, po.payment_method_id, v_total, 'pending', false,
           'Loja online: ' || po.label
      FROM public.ped_unit_payment_options po WHERE po.id = p_payment_option_id;
  END IF;

  INSERT INTO public.ped_order_status_history (
    company_id, order_id, from_status, to_status, changed_by, source, reason, metadata, version_after)
  VALUES (v_order.company_id, v_order.id, NULL, 'pending_acceptance', NULL, 'integracao',
    'Pedido da loja online', jsonb_build_object('items', v_i, 'total_amount', v_total, 'storefront', v_store.slug),
    v_order.version);

  RETURN jsonb_build_object('success', true, 'order_id', v_order.id,
    'display_number', v_order.display_number, 'status', v_order.status,
    'subtotal', v_subtotal, 'delivery_fee', v_delivery_fee, 'service_fee', v_service_fee,
    'total_amount', v_total, 'message', 'Pedido enviado!');
END; $$;

GRANT EXECUTE ON FUNCTION public.storefront_public_create_order(text, jsonb, text, text, text, text, uuid, jsonb, uuid) TO anon, authenticated;

-- =========================================================
-- Acompanhamento público do pedido
-- =========================================================
CREATE OR REPLACE FUNCTION public.storefront_public_track_order(
  p_slug text, p_display_number int, p_phone text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store public.ped_storefronts;
  v_order public.ped_orders;
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  SELECT * INTO v_store FROM public.ped_storefronts
   WHERE slug = lower(btrim(p_slug)) AND is_published;
  IF v_store.id IS NULL OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_order FROM public.ped_orders o
   WHERE o.unit_id = v_store.unit_id
     AND o.display_number = p_display_number
     AND regexp_replace(COALESCE(o.customer_phone, ''), '[^0-9]', '', 'g') = v_phone
   ORDER BY o.created_at DESC LIMIT 1;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'display_number', v_order.display_number,
    'status', v_order.status,
    'order_type', v_order.order_type,
    'total_amount', v_order.total_amount,
    'placed_at', v_order.placed_at,
    'accepted_at', v_order.accepted_at,
    'ready_at', v_order.ready_at,
    'dispatched_at', v_order.dispatched_at,
    'delivered_at', v_order.delivered_at,
    'completed_at', v_order.completed_at,
    'cancelled_at', v_order.cancelled_at,
    'pickup_code', v_order.pickup_code,
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', i.name_snapshot, 'quantity', i.quantity,
                                                           'total_price', i.total_price) ORDER BY i.sort_order)
                         FROM public.ped_order_items i WHERE i.order_id = v_order.id), '[]'::jsonb)
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.storefront_public_track_order(text, int, text) TO anon, authenticated;