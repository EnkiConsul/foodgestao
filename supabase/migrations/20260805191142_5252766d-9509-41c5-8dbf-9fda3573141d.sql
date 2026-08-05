-- corrige from_status no histórico
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
  v_from public.ped_order_status;
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

  SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id FOR UPDATE;
  v_from := v_order.status;

  IF v_from = p_to THEN
    RETURN jsonb_build_object('success', true, 'code', 'already_in_status',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', 'Pedido já está neste estado.');
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_order.version THEN
    RETURN jsonb_build_object('success', false, 'code', 'version_conflict',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', 'O pedido foi atualizado por outro usuário. Recarregue.');
  END IF;

  IF NOT public.ped_order_transition_allowed(v_from, p_to) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_transition',
      'order_id', v_order.id, 'status', v_order.status, 'version', v_order.version,
      'message', format('Transição inválida: %s → %s.', v_from, p_to));
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
  VALUES (v_order.company_id, v_order.id, v_from, p_to, auth.uid(),
    coalesce(p_source, 'painel'), nullif(btrim(p_reason), ''),
    coalesce(p_metadata, '{}'::jsonb), v_key, v_order.version);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'order_status_changed', 'ped_orders', v_order.id::text,
    jsonb_build_object('company_id', v_order.company_id, 'from', v_from, 'to', p_to,
      'operation', p_operation, 'version', v_order.version));

  RETURN jsonb_build_object('success', true, 'code', 'updated', 'order_id', v_order.id,
    'status', v_order.status, 'version', v_order.version, 'message', 'Pedido atualizado.');
END; $$;

-- fail closed: nada de execução anônima nos helpers do domínio de pedidos
REVOKE ALL ON FUNCTION public.ped_can_read_orders(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_can_read_orders(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_can_operate_orders(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_can_operate_orders(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_is_order_courier(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_is_order_courier(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_assert_orders_operation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_assert_orders_operation(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_create_order(uuid, jsonb, public.ped_fulfillment_mode, uuid, uuid, text, text, text, integer, integer, integer, public.ped_order_timing, timestamptz, timestamptz, timestamptz, jsonb, boolean, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_order_transition(uuid, public.ped_order_status, text, integer, text, public.ped_history_source, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ped_order_transition(uuid, public.ped_order_status, text, integer, text, public.ped_history_source, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_accept_order(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_start_order_preparation(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_mark_order_ready(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_await_order_pickup(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_dispatch_order(uuid, integer, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_mark_order_delivered(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_complete_order(uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_request_order_cancellation(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_cancel_order(uuid, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ped_apply_order_adjustment(uuid, public.ped_adjustment_kind, integer, text, integer, text) FROM anon;