-- Cardapio publico: escolher o cardapio com itens e ocultar categorias vazias
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

  -- Prefere um cardapio ativo que realmente tenha produtos publicaveis,
  -- para que um cardapio vazio nao "ganhe" de outro com itens.
  SELECT m.id INTO v_menu_id FROM public.ped_menus m
   WHERE m.company_id = v_store.company_id
     AND (m.unit_id = v_unit.id OR m.unit_id IS NULL)
     AND m.state = 'active' AND m.archived_at IS NULL
   ORDER BY
     EXISTS (
       SELECT 1 FROM public.ped_menu_categories c
         JOIN public.ped_products pr ON pr.category_id = c.id
        WHERE c.menu_id = m.id AND c.state = 'active' AND c.archived_at IS NULL
          AND pr.archived_at IS NULL AND pr.state <> 'archived'
     ) DESC,
     (m.unit_id = v_unit.id) DESC, m.is_default DESC, m.sort_order, m.created_at
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
           AND EXISTS (
             SELECT 1 FROM public.ped_products pr2
              WHERE pr2.category_id = c.id AND pr2.archived_at IS NULL AND pr2.state <> 'archived'
           )
      ) c2), '[]'::jsonb)
  );

  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.storefront_public_get(text) TO anon, authenticated;