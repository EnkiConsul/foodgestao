-- =========================================================
-- FASE 10 — Relatórios, exportações e observabilidade
-- =========================================================

CREATE INDEX IF NOT EXISTS ped_orders_company_placed_idx
  ON public.ped_orders (company_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS ped_orders_company_unit_placed_idx
  ON public.ped_orders (company_id, unit_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS ped_orders_company_status_idx
  ON public.ped_orders (company_id, status);
CREATE INDEX IF NOT EXISTS ped_order_items_company_product_idx
  ON public.ped_order_items (company_id, product_id);
CREATE INDEX IF NOT EXISTS ped_order_payments_company_order_idx
  ON public.ped_order_payments (company_id, order_id);

-- ---------------------------------------------------------
-- Mascaramento de dados pessoais
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_mask_phone(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_value IS NULL OR length(regexp_replace(p_value, '\D', '', 'g')) < 4 THEN NULL
    ELSE '••••' || right(regexp_replace(p_value, '\D', '', 'g'), 4)
  END;
$$;

CREATE OR REPLACE FUNCTION public.ped_mask_name(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN p_value IS NULL OR btrim(p_value) = '' THEN NULL
    ELSE split_part(btrim(p_value), ' ', 1) || CASE
      WHEN position(' ' IN btrim(p_value)) > 0 THEN ' ' || left(split_part(btrim(p_value), ' ', 2), 1) || '.'
      ELSE '' END
  END;
$$;

-- ---------------------------------------------------------
-- Relatório operacional consolidado
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_reports_overview(
  p_company_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_unit_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ent jsonb;
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_totals jsonb;
  v_by_unit jsonb;
  v_by_channel jsonb;
  v_by_type jsonb;
  v_by_day jsonb;
  v_peak jsonb;
  v_products jsonb;
  v_delivery jsonb;
BEGIN
  v_ent := public.can_use_orders_module(p_company_id, 'orders.reports');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Sem permissão para ver relatórios de pedidos.' USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ped_rep (LIKE public.ped_orders) ON COMMIT DROP;
  DELETE FROM _ped_rep;
  INSERT INTO _ped_rep
  SELECT o.* FROM public.ped_orders o
   WHERE o.company_id = p_company_id
     AND (p_unit_id IS NULL OR o.unit_id = p_unit_id)
     AND o.placed_at >= v_from AND o.placed_at <= v_to
     AND (p_include_test OR o.is_test = false);

  SELECT jsonb_build_object(
    'orders', count(*),
    'orders_completed', count(*) FILTER (WHERE status = 'completed'),
    'orders_cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'cancel_rate', CASE WHEN count(*) = 0 THEN 0
                        ELSE round(100.0 * count(*) FILTER (WHERE status = 'cancelled') / count(*), 2) END,
    'gross_sales', COALESCE(sum(subtotal), 0),
    'discounts', COALESCE(sum(discount_amount), 0),
    'delivery_fees', COALESCE(sum(delivery_fee), 0),
    'service_fees', COALESCE(sum(service_fee), 0),
    'total_amount', COALESCE(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0),
    'estimated_net', COALESCE(sum(COALESCE(estimated_net_amount, total_amount)) FILTER (WHERE status <> 'cancelled'), 0),
    'avg_ticket', CASE WHEN count(*) FILTER (WHERE status <> 'cancelled') = 0 THEN 0
                       ELSE round(COALESCE(sum(total_amount) FILTER (WHERE status <> 'cancelled'), 0)::numeric
                                  / count(*) FILTER (WHERE status <> 'cancelled'), 0) END,
    'avg_accept_seconds', COALESCE(round(avg(EXTRACT(epoch FROM (accepted_at - placed_at)))
                            FILTER (WHERE accepted_at IS NOT NULL))::int, 0),
    'avg_prep_seconds', COALESCE(round(avg(EXTRACT(epoch FROM (ready_at - preparation_started_at)))
                            FILTER (WHERE ready_at IS NOT NULL AND preparation_started_at IS NOT NULL))::int, 0),
    'avg_total_seconds', COALESCE(round(avg(EXTRACT(epoch FROM (COALESCE(completed_at, delivered_at) - placed_at)))
                            FILTER (WHERE COALESCE(completed_at, delivered_at) IS NOT NULL))::int, 0),
    'p95_total_seconds', COALESCE(round(percentile_disc(0.95) WITHIN GROUP (
                            ORDER BY EXTRACT(epoch FROM (COALESCE(completed_at, delivered_at) - placed_at))))::int, 0),
    'test_orders', count(*) FILTER (WHERE is_test)
  ) INTO v_totals FROM _ped_rep;

  -- atrasos: tempo total acima da tolerância da unidade
  SELECT v_totals || jsonb_build_object(
    'late_orders', COALESCE(count(*), 0),
    'late_rate', CASE WHEN COALESCE((v_totals->>'orders')::numeric, 0) = 0 THEN 0
                      ELSE round(100.0 * count(*) / (v_totals->>'orders')::numeric, 2) END
  ) INTO v_totals
  FROM _ped_rep r
  JOIN public.ped_units u ON u.id = r.unit_id
  WHERE COALESCE(r.completed_at, r.delivered_at) IS NOT NULL
    AND EXTRACT(epoch FROM (COALESCE(r.completed_at, r.delivered_at) - r.placed_at)) >
        60 * (COALESCE(u.prep_time_minutes, 30) + COALESCE(u.delay_tolerance_minutes, 10));

  -- reembolsos
  SELECT v_totals || jsonb_build_object(
    'refunds', COALESCE(sum(p.refunded_amount), 0),
    'refunded_payments', count(*) FILTER (WHERE COALESCE(p.refunded_amount, 0) > 0)
  ) INTO v_totals
  FROM public.ped_order_payments p
  JOIN _ped_rep r ON r.id = p.order_id;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.orders DESC), '[]'::jsonb) INTO v_by_unit FROM (
    SELECT u.id AS unit_id, COALESCE(un.nome, u.codigo_interno, 'Unidade') AS unit_name,
           count(*)::int AS orders,
           COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue
      FROM _ped_rep r
      JOIN public.ped_units u ON u.id = r.unit_id
      LEFT JOIN public.dp_unidades un ON un.id = u.unidade_id
     GROUP BY u.id, un.nome, u.codigo_interno
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.orders DESC), '[]'::jsonb) INTO v_by_channel FROM (
    SELECT COALESCE(c.channel::text, 'manual') AS channel, count(*)::int AS orders,
           COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue
      FROM _ped_rep r
      LEFT JOIN public.ped_order_channels c ON c.id = r.channel_id
     GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.orders DESC), '[]'::jsonb) INTO v_by_type FROM (
    SELECT r.order_type::text AS order_type, r.order_timing::text AS order_timing,
           count(*)::int AS orders,
           COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue
      FROM _ped_rep r GROUP BY 1, 2
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.day), '[]'::jsonb) INTO v_by_day FROM (
    SELECT to_char(date_trunc('day', r.placed_at), 'YYYY-MM-DD') AS day,
           count(*)::int AS orders,
           COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue
      FROM _ped_rep r GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.hour), '[]'::jsonb) INTO v_peak FROM (
    SELECT EXTRACT(hour FROM r.placed_at)::int AS hour, count(*)::int AS orders,
           COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue
      FROM _ped_rep r GROUP BY 1
  ) x;

  SELECT COALESCE(jsonb_agg(x ORDER BY x.quantity DESC), '[]'::jsonb) INTO v_products FROM (
    SELECT i.name_snapshot AS product, sum(i.quantity)::int AS quantity,
           sum(i.total_price)::bigint AS revenue,
           COALESCE(round(avg(EXTRACT(epoch FROM (i.prepared_at - r.preparation_started_at)))
             FILTER (WHERE i.prepared_at IS NOT NULL AND r.preparation_started_at IS NOT NULL))::int, 0) AS avg_prep_seconds
      FROM public.ped_order_items i
      JOIN _ped_rep r ON r.id = i.order_id
     WHERE r.status <> 'cancelled'
     GROUP BY i.name_snapshot
     ORDER BY quantity DESC
     LIMIT 20
  ) x;

  SELECT jsonb_build_object(
    'deliveries', count(*),
    'delivered', count(*) FILTER (WHERE d.status = 'delivered'),
    'failed', count(*) FILTER (WHERE d.failed_at IS NOT NULL),
    'avg_pickup_seconds', COALESCE(round(avg(EXTRACT(epoch FROM (d.picked_up_at - d.assigned_at)))
        FILTER (WHERE d.picked_up_at IS NOT NULL AND d.assigned_at IS NOT NULL))::int, 0),
    'avg_transit_seconds', COALESCE(round(avg(EXTRACT(epoch FROM (d.delivered_at - d.picked_up_at)))
        FILTER (WHERE d.delivered_at IS NOT NULL AND d.picked_up_at IS NOT NULL))::int, 0),
    'avg_distance_meters', COALESCE(round(avg(d.distance_meters))::int, 0),
    'fees', COALESCE(sum(d.fee_amount), 0)
  ) INTO v_delivery
  FROM public.ped_order_deliveries d
  JOIN _ped_rep r ON r.id = d.order_id;

  RETURN jsonb_build_object(
    'success', true,
    'range', jsonb_build_object('from', v_from, 'to', v_to, 'include_test', p_include_test,
                                'unit_id', p_unit_id),
    'totals', v_totals,
    'by_unit', v_by_unit,
    'by_channel', v_by_channel,
    'by_type', v_by_type,
    'by_day', v_by_day,
    'peak_hours', v_peak,
    'top_products', v_products,
    'delivery', v_delivery,
    'generated_at', now()
  );
END; $$;

-- ---------------------------------------------------------
-- Exportações seguras com mascaramento por papel
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_export_dataset(
  p_company_id uuid,
  p_dataset text,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_unit_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_limit integer DEFAULT 5000
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ent jsonb;
  v_pii boolean := false;
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 20000);
  v_rows jsonb := '[]'::jsonb;
BEGIN
  v_ent := public.can_use_orders_module(p_company_id, 'orders.reports');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Sem permissão para exportar dados de pedidos.' USING ERRCODE = '42501';
  END IF;

  v_pii := COALESCE((public.can_use_orders_module(p_company_id, 'orders.customer_data')->>'allowed')::boolean, false);

  IF p_dataset NOT IN ('orders', 'items', 'payments', 'cancellations', 'customers') THEN
    RAISE EXCEPTION 'Conjunto de dados inválido.' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _ped_exp (LIKE public.ped_orders) ON COMMIT DROP;
  DELETE FROM _ped_exp;
  INSERT INTO _ped_exp
  SELECT o.* FROM public.ped_orders o
   WHERE o.company_id = p_company_id
     AND (p_unit_id IS NULL OR o.unit_id = p_unit_id)
     AND o.placed_at >= v_from AND o.placed_at <= v_to
     AND (p_include_test OR o.is_test = false)
   ORDER BY o.placed_at DESC
   LIMIT v_limit;

  IF p_dataset = 'orders' THEN
    SELECT COALESCE(jsonb_agg(t ORDER BY t.placed_at DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT r.display_number, r.placed_at, r.status::text AS status,
             r.order_type::text AS order_type, r.order_timing::text AS order_timing,
             r.payment_status::text AS payment_status,
             r.subtotal, r.discount_amount, r.delivery_fee, r.service_fee, r.total_amount,
             r.estimated_net_amount, r.is_test,
             CASE WHEN v_pii THEN r.customer_name ELSE public.ped_mask_name(r.customer_name) END AS customer_name,
             CASE WHEN v_pii THEN r.customer_phone ELSE public.ped_mask_phone(r.customer_phone) END AS customer_phone,
             r.accepted_at, r.ready_at, r.dispatched_at, r.completed_at, r.cancelled_at
        FROM _ped_exp r
    ) t;
  ELSIF p_dataset = 'items' THEN
    SELECT COALESCE(jsonb_agg(t ORDER BY t.placed_at DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT r.display_number, r.placed_at, i.name_snapshot AS product,
             i.variant_name_snapshot AS variant, i.quantity, i.unit_price,
             i.options_price, i.total_price, i.station::text AS station, i.prepared_at
        FROM public.ped_order_items i JOIN _ped_exp r ON r.id = i.order_id
    ) t;
  ELSIF p_dataset = 'payments' THEN
    SELECT COALESCE(jsonb_agg(t ORDER BY t.placed_at DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT r.display_number, r.placed_at, p.kind::text AS kind, p.status::text AS status,
             p.amount, p.refunded_amount, p.is_online, p.paid_at, p.refunded_at, p.refund_reason
        FROM public.ped_order_payments p JOIN _ped_exp r ON r.id = p.order_id
    ) t;
  ELSIF p_dataset = 'cancellations' THEN
    SELECT COALESCE(jsonb_agg(t ORDER BY t.cancelled_at DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT r.display_number, r.placed_at, r.cancelled_at, r.cancellation_reason,
             r.order_type::text AS order_type, r.total_amount
        FROM _ped_exp r WHERE r.cancelled_at IS NOT NULL
    ) t;
  ELSE
    IF NOT v_pii THEN
      RAISE EXCEPTION 'Sem permissão para exportar dados de clientes.' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(jsonb_agg(t ORDER BY t.orders DESC), '[]'::jsonb) INTO v_rows FROM (
      SELECT r.customer_name, r.customer_phone, count(*)::int AS orders,
             COALESCE(sum(r.total_amount) FILTER (WHERE r.status <> 'cancelled'), 0)::bigint AS revenue,
             max(r.placed_at) AS last_order_at
        FROM _ped_exp r
       WHERE COALESCE(r.customer_name, r.customer_phone) IS NOT NULL
       GROUP BY r.customer_name, r.customer_phone
    ) t;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'orders_export', 'ped_orders', p_company_id::text,
          jsonb_build_object('dataset', p_dataset, 'rows', jsonb_array_length(v_rows),
                             'masked', NOT v_pii, 'from', v_from, 'to', v_to));

  RETURN jsonb_build_object('success', true, 'dataset', p_dataset, 'masked', NOT v_pii,
                            'count', jsonb_array_length(v_rows), 'rows', v_rows);
END; $$;

-- ---------------------------------------------------------
-- Painel técnico de saúde operacional
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_ops_health(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ent jsonb;
  v_queue jsonb;
  v_print jsonb;
  v_notif jsonb;
  v_orders jsonb;
BEGIN
  v_ent := public.can_use_orders_module(p_company_id, 'orders.reports');
  IF NOT COALESCE((v_ent->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Sem permissão para ver a saúde operacional.' USING ERRCODE = '42501';
  END IF;

  v_queue := public.ped_integration_metrics(p_company_id);

  SELECT jsonb_build_object(
    'total', count(*),
    'queued', count(*) FILTER (WHERE status = 'queued'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'printed', count(*) FILTER (WHERE status = 'printed')
  ) INTO v_print
  FROM public.ped_print_jobs
  WHERE company_id = p_company_id AND created_at >= now() - interval '7 days';

  SELECT jsonb_build_object(
    'open_dead_letters', count(*) FILTER (WHERE resolved_at IS NULL),
    'last_7d', count(*)
  ) INTO v_notif
  FROM public.ped_dead_letters
  WHERE company_id = p_company_id AND created_at >= now() - interval '7 days';

  SELECT jsonb_build_object(
    'open_orders', count(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')),
    'awaiting_accept', count(*) FILTER (WHERE status = 'pending'),
    'stuck_over_2h', count(*) FILTER (WHERE status NOT IN ('completed', 'cancelled')
                                       AND placed_at < now() - interval '2 hours'),
    'last_order_at', max(placed_at)
  ) INTO v_orders
  FROM public.ped_orders WHERE company_id = p_company_id;

  RETURN jsonb_build_object('success', true, 'queue', v_queue, 'print', v_print,
                            'dead_letters', v_notif, 'orders', v_orders, 'generated_at', now());
END; $$;

REVOKE ALL ON FUNCTION public.ped_reports_overview(uuid, timestamptz, timestamptz, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_reports_overview(uuid, timestamptz, timestamptz, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_export_dataset(uuid, text, timestamptz, timestamptz, uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_export_dataset(uuid, text, timestamptz, timestamptz, uuid, boolean, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_ops_health(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_ops_health(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_mask_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_mask_phone(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_mask_name(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_mask_name(text) TO authenticated, service_role;