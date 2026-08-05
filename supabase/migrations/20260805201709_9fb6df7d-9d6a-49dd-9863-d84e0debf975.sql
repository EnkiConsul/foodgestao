-- =========================================================
-- PEDIDOS FASE 9 — Motor das filas (inbox/outbox)
-- =========================================================

CREATE OR REPLACE FUNCTION public.ped_queue_backoff(p_attempts integer)
RETURNS interval LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT make_interval(secs => LEAST(3600, 5 * power(2, GREATEST(COALESCE(p_attempts, 0), 0))::int)
                               + floor(random() * 5)::int);
$$;

-- ---------------------------------------------------------
-- INBOX: recebimento idempotente
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_inbox_enqueue(
  p_integration_id uuid,
  p_external_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_signature_valid boolean DEFAULT false,
  p_external_order_id text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_int public.ped_order_integrations;
  v_id uuid;
  v_status public.ped_queue_status := 'pending';
BEGIN
  IF p_integration_id IS NULL OR coalesce(btrim(p_external_event_id), '') = ''
     OR coalesce(btrim(p_event_type), '') = '' THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'invalid_payload');
  END IF;

  SELECT * INTO v_int FROM public.ped_order_integrations WHERE id = p_integration_id;
  IF v_int.id IS NULL THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'integration_not_found');
  END IF;

  -- fail closed: sem assinatura válida nada é processado
  IF NOT COALESCE(p_signature_valid, false) THEN
    RETURN jsonb_build_object('accepted', false, 'code', 'invalid_signature');
  END IF;

  IF v_int.status NOT IN ('sandbox','active') THEN
    v_status := 'ignored';
  END IF;

  INSERT INTO public.ped_event_inbox (
    integration_id, company_id, unit_id, provider, external_event_id, external_order_id,
    event_type, payload, signature_valid, occurred_at, status, next_attempt_at, processed_at
  ) VALUES (
    v_int.id, v_int.company_id, v_int.unit_id, v_int.provider,
    btrim(p_external_event_id), nullif(btrim(coalesce(p_external_order_id, '')), ''),
    btrim(p_event_type), COALESCE(p_payload, '{}'::jsonb), true, p_occurred_at,
    v_status, now(), CASE WHEN v_status = 'ignored' THEN now() END
  )
  ON CONFLICT (provider, external_event_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('accepted', true, 'code', 'duplicate');
  END IF;

  UPDATE public.ped_order_integrations SET last_event_at = now() WHERE id = v_int.id;

  RETURN jsonb_build_object('accepted', true, 'code',
    CASE WHEN v_status = 'ignored' THEN 'ignored' ELSE 'enqueued' END, 'id', v_id);
END; $$;

-- Claim atômico com lease
CREATE OR REPLACE FUNCTION public.ped_inbox_claim(
  p_worker text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 60
) RETURNS SETOF public.ped_event_inbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.ped_event_inbox
     WHERE status = 'pending' AND next_attempt_at <= now()
     ORDER BY received_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100)
  )
  UPDATE public.ped_event_inbox e
     SET status = 'processing',
         locked_by = COALESCE(nullif(btrim(p_worker), ''), 'worker'),
         lease_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 5), 900)),
         attempts = e.attempts + 1,
         updated_at = now()
   WHERE e.id IN (SELECT id FROM claimed)
  RETURNING e.*;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_inbox_complete(
  p_id uuid,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_duration_ms integer DEFAULT NULL,
  p_worker text DEFAULT NULL,
  p_ignored boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.ped_event_inbox;
BEGIN
  UPDATE public.ped_event_inbox
     SET status = CASE WHEN COALESCE(p_ignored, false) THEN 'ignored' ELSE 'done' END,
         processed_at = now(), lease_until = NULL, locked_by = NULL,
         order_id = COALESCE(p_order_id, order_id),
         result = COALESCE(p_result, '{}'::jsonb),
         error_class = NULL, error_message = NULL, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  INSERT INTO public.ped_event_attempts (company_id, inbox_id, attempt_no, outcome, duration_ms, worker)
  VALUES (v_row.company_id, v_row.id, v_row.attempts,
    CASE WHEN COALESCE(p_ignored, false) THEN 'ignored' ELSE 'success' END, p_duration_ms, p_worker);

  RETURN jsonb_build_object('success', true, 'status', v_row.status);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_inbox_fail(
  p_id uuid,
  p_error_class text,
  p_error_message text,
  p_transient boolean DEFAULT true,
  p_duration_ms integer DEFAULT NULL,
  p_worker text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.ped_event_inbox;
  v_dead boolean;
  v_msg text := left(COALESCE(p_error_message, ''), 500);
  v_class text := left(COALESCE(nullif(btrim(p_error_class), ''), 'unknown'), 60);
BEGIN
  SELECT * INTO v_row FROM public.ped_event_inbox WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'not_found');
  END IF;

  v_dead := NOT COALESCE(p_transient, true) OR v_row.attempts >= v_row.max_attempts;

  UPDATE public.ped_event_inbox
     SET status = CASE WHEN v_dead THEN 'dead' ELSE 'pending' END,
         next_attempt_at = CASE WHEN v_dead THEN next_attempt_at
                                ELSE now() + public.ped_queue_backoff(v_row.attempts) END,
         lease_until = NULL, locked_by = NULL,
         processed_at = CASE WHEN v_dead THEN now() ELSE NULL END,
         error_class = v_class, error_message = v_msg, updated_at = now()
   WHERE id = v_row.id;

  INSERT INTO public.ped_event_attempts (company_id, inbox_id, attempt_no, outcome, error_class, error_message, duration_ms, worker)
  VALUES (v_row.company_id, v_row.id, v_row.attempts,
    CASE WHEN v_class = 'timeout' THEN 'timeout'
         WHEN COALESCE(p_transient, true) THEN 'transient' ELSE 'permanent' END,
    v_class, v_msg, p_duration_ms, p_worker);

  IF v_dead THEN
    INSERT INTO public.ped_dead_letters (company_id, integration_id, provider, source, source_id,
      event_type, payload, attempts, error_class, error_message)
    VALUES (v_row.company_id, v_row.integration_id, v_row.provider, 'inbox', v_row.id,
      v_row.event_type, v_row.payload, v_row.attempts, v_class, v_msg);
  END IF;

  RETURN jsonb_build_object('success', true, 'dead', v_dead,
    'attempts', v_row.attempts, 'max_attempts', v_row.max_attempts);
END; $$;

-- Leases expirados (timeout de worker)
CREATE OR REPLACE FUNCTION public.ped_queue_reap_expired(p_worker text DEFAULT 'reaper')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_inbox int := 0; v_outbox int := 0; r record;
BEGIN
  FOR r IN
    SELECT id, company_id, attempts, max_attempts FROM public.ped_event_inbox
     WHERE status = 'processing' AND lease_until IS NOT NULL AND lease_until < now()
     LIMIT 200
  LOOP
    PERFORM public.ped_inbox_fail(r.id, 'timeout', 'Lease expirado sem conclusão do worker.', true, NULL, p_worker);
    v_inbox := v_inbox + 1;
  END LOOP;

  FOR r IN
    SELECT id FROM public.ped_outbox
     WHERE status = 'processing' AND lease_until IS NOT NULL AND lease_until < now()
     LIMIT 200
  LOOP
    PERFORM public.ped_outbox_fail(r.id, 'timeout', 'Lease expirado sem conclusão do worker.', true, NULL, p_worker);
    v_outbox := v_outbox + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inbox_reaped', v_inbox, 'outbox_reaped', v_outbox);
END; $$;

-- ---------------------------------------------------------
-- OUTBOX
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_outbox_enqueue(
  p_integration_id uuid,
  p_operation text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_order_id uuid DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_int public.ped_order_integrations;
  v_order public.ped_orders;
  v_key text;
  v_id uuid;
BEGIN
  SELECT * INTO v_int FROM public.ped_order_integrations WHERE id = p_integration_id;
  IF v_int.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'integration_not_found');
  END IF;

  -- service_role interno pula a checagem de sessão; usuário precisa de permissão de escrita
  IF auth.uid() IS NOT NULL THEN
    PERFORM public.ped_assert_orders_operation(v_int.company_id, 'orders.manage');
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.ped_orders WHERE id = p_order_id;
    IF v_order.id IS NULL OR v_order.company_id <> v_int.company_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'order_company_mismatch');
    END IF;
  END IF;

  v_key := COALESCE(nullif(btrim(p_dedupe_key), ''),
    concat_ws(':', p_operation, coalesce(p_order_id::text, 'na'), md5(COALESCE(p_payload, '{}'::jsonb)::text)));

  INSERT INTO public.ped_outbox (integration_id, company_id, order_id, provider, operation,
    payload, dedupe_key, created_by)
  VALUES (v_int.id, v_int.company_id, p_order_id, v_int.provider, btrim(p_operation),
    COALESCE(p_payload, '{}'::jsonb), v_key, auth.uid())
  ON CONFLICT (integration_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'code', 'duplicate');
  END IF;
  RETURN jsonb_build_object('success', true, 'code', 'enqueued', 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_outbox_claim(
  p_worker text,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 60
) RETURNS SETOF public.ped_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.ped_outbox
     WHERE status = 'pending' AND next_attempt_at <= now()
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100)
  )
  UPDATE public.ped_outbox o
     SET status = 'processing',
         locked_by = COALESCE(nullif(btrim(p_worker), ''), 'worker'),
         lease_until = now() + make_interval(secs => LEAST(GREATEST(COALESCE(p_lease_seconds, 60), 5), 900)),
         attempts = o.attempts + 1,
         updated_at = now()
   WHERE o.id IN (SELECT id FROM claimed)
  RETURNING o.*;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_outbox_complete(
  p_id uuid,
  p_external_ref text DEFAULT NULL,
  p_result jsonb DEFAULT '{}'::jsonb,
  p_duration_ms integer DEFAULT NULL,
  p_worker text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_row public.ped_outbox;
BEGIN
  UPDATE public.ped_outbox
     SET status = 'done', sent_at = now(), lease_until = NULL, locked_by = NULL,
         external_ref = nullif(btrim(coalesce(p_external_ref, '')), ''),
         result = COALESCE(p_result, '{}'::jsonb),
         error_class = NULL, error_message = NULL, updated_at = now()
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'not_found'); END IF;

  INSERT INTO public.ped_event_attempts (company_id, outbox_id, attempt_no, outcome, duration_ms, worker)
  VALUES (v_row.company_id, v_row.id, v_row.attempts, 'success', p_duration_ms, p_worker);
  RETURN jsonb_build_object('success', true);
END; $$;

CREATE OR REPLACE FUNCTION public.ped_outbox_fail(
  p_id uuid,
  p_error_class text,
  p_error_message text,
  p_transient boolean DEFAULT true,
  p_duration_ms integer DEFAULT NULL,
  p_worker text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_row public.ped_outbox;
  v_dead boolean;
  v_msg text := left(COALESCE(p_error_message, ''), 500);
  v_class text := left(COALESCE(nullif(btrim(p_error_class), ''), 'unknown'), 60);
BEGIN
  SELECT * INTO v_row FROM public.ped_outbox WHERE id = p_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'not_found'); END IF;

  v_dead := NOT COALESCE(p_transient, true) OR v_row.attempts >= v_row.max_attempts;

  UPDATE public.ped_outbox
     SET status = CASE WHEN v_dead THEN 'dead' ELSE 'pending' END,
         next_attempt_at = CASE WHEN v_dead THEN next_attempt_at
                                ELSE now() + public.ped_queue_backoff(v_row.attempts) END,
         lease_until = NULL, locked_by = NULL,
         error_class = v_class, error_message = v_msg, updated_at = now()
   WHERE id = v_row.id;

  INSERT INTO public.ped_event_attempts (company_id, outbox_id, attempt_no, outcome, error_class, error_message, duration_ms, worker)
  VALUES (v_row.company_id, v_row.id, v_row.attempts,
    CASE WHEN v_class = 'timeout' THEN 'timeout'
         WHEN COALESCE(p_transient, true) THEN 'transient' ELSE 'permanent' END,
    v_class, v_msg, p_duration_ms, p_worker);

  IF v_dead THEN
    INSERT INTO public.ped_dead_letters (company_id, integration_id, provider, source, source_id,
      event_type, payload, attempts, error_class, error_message)
    VALUES (v_row.company_id, v_row.integration_id, v_row.provider, 'outbox', v_row.id,
      v_row.operation, v_row.payload, v_row.attempts, v_class, v_msg);
  END IF;

  RETURN jsonb_build_object('success', true, 'dead', v_dead, 'attempts', v_row.attempts);
END; $$;

-- ---------------------------------------------------------
-- Mapeamentos
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_map_external(
  p_integration_id uuid,
  p_entity_type text,
  p_external_id text,
  p_internal_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_int public.ped_order_integrations; v_id uuid;
BEGIN
  SELECT * INTO v_int FROM public.ped_order_integrations WHERE id = p_integration_id;
  IF v_int.id IS NULL THEN RAISE EXCEPTION 'Integração não encontrada.' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.ped_external_mappings (integration_id, company_id, provider, entity_type,
    external_id, internal_id, metadata)
  VALUES (v_int.id, v_int.company_id, v_int.provider, p_entity_type, btrim(p_external_id),
    p_internal_id, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (integration_id, entity_type, external_id)
  DO UPDATE SET internal_id = EXCLUDED.internal_id,
                metadata = EXCLUDED.metadata,
                updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.ped_lookup_external(
  p_integration_id uuid, p_entity_type text, p_external_id text
) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT internal_id FROM public.ped_external_mappings
   WHERE integration_id = p_integration_id AND entity_type = p_entity_type
     AND external_id = btrim(p_external_id);
$$;

-- ---------------------------------------------------------
-- Reprocessamento de dead letter
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_replay_dead_letter(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_dl public.ped_dead_letters;
BEGIN
  SELECT * INTO v_dl FROM public.ped_dead_letters WHERE id = p_id FOR UPDATE;
  IF v_dl.id IS NULL THEN RETURN jsonb_build_object('success', false, 'code', 'not_found'); END IF;

  IF auth.uid() IS NOT NULL THEN
    PERFORM public.ped_assert_orders_operation(v_dl.company_id, 'orders.manage');
  END IF;
  IF v_dl.replayed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'already_replayed');
  END IF;

  IF v_dl.source = 'inbox' THEN
    UPDATE public.ped_event_inbox
       SET status = 'pending', attempts = 0, next_attempt_at = now(),
           lease_until = NULL, locked_by = NULL, processed_at = NULL,
           error_class = NULL, error_message = NULL, updated_at = now()
     WHERE id = v_dl.source_id;
  ELSE
    UPDATE public.ped_outbox
       SET status = 'pending', attempts = 0, next_attempt_at = now(),
           lease_until = NULL, locked_by = NULL,
           error_class = NULL, error_message = NULL, updated_at = now()
     WHERE id = v_dl.source_id;
  END IF;

  UPDATE public.ped_dead_letters SET replayed_at = now(), replayed_by = auth.uid() WHERE id = v_dl.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), 'ped_dead_letter_replayed', 'ped_dead_letters', v_dl.id::text,
    jsonb_build_object('company_id', v_dl.company_id, 'source', v_dl.source,
      'source_id', v_dl.source_id, 'provider', v_dl.provider));

  RETURN jsonb_build_object('success', true, 'source', v_dl.source);
END; $$;

-- ---------------------------------------------------------
-- Métricas
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ped_integration_metrics(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_inbox jsonb; v_outbox jsonb; v_dead int; v_lag numeric;
BEGIN
  IF NOT public.ped_can_read_orders(p_company_id) THEN
    RAISE EXCEPTION 'Sem acesso às integrações desta empresa.' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'done', count(*) FILTER (WHERE status = 'done'),
    'ignored', count(*) FILTER (WHERE status = 'ignored'),
    'dead', count(*) FILTER (WHERE status = 'dead'),
    'total', count(*))
    INTO v_inbox FROM public.ped_event_inbox WHERE company_id = p_company_id;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'done', count(*) FILTER (WHERE status = 'done'),
    'dead', count(*) FILTER (WHERE status = 'dead'),
    'total', count(*))
    INTO v_outbox FROM public.ped_outbox WHERE company_id = p_company_id;

  SELECT count(*) INTO v_dead FROM public.ped_dead_letters
   WHERE company_id = p_company_id AND replayed_at IS NULL;

  SELECT COALESCE(max(EXTRACT(epoch FROM now() - received_at)), 0) INTO v_lag
    FROM public.ped_event_inbox WHERE company_id = p_company_id AND status = 'pending';

  RETURN jsonb_build_object('inbox', v_inbox, 'outbox', v_outbox,
    'dead_letters_open', v_dead, 'oldest_pending_seconds', round(COALESCE(v_lag, 0)),
    'generated_at', now());
END; $$;

-- ---------------------------------------------------------
-- PERMISSÕES: workers são internos (service_role)
-- ---------------------------------------------------------
REVOKE ALL ON FUNCTION public.ped_inbox_enqueue(uuid, text, text, jsonb, boolean, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_inbox_claim(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_inbox_complete(uuid, jsonb, uuid, integer, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_inbox_fail(uuid, text, text, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_outbox_claim(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_outbox_complete(uuid, text, jsonb, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_outbox_fail(uuid, text, text, boolean, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_queue_reap_expired(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_map_external(uuid, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_lookup_external(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ped_queue_backoff(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ped_inbox_enqueue(uuid, text, text, jsonb, boolean, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_inbox_claim(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_inbox_complete(uuid, jsonb, uuid, integer, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_inbox_fail(uuid, text, text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_outbox_claim(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_outbox_complete(uuid, text, jsonb, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_outbox_fail(uuid, text, text, boolean, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_queue_reap_expired(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_map_external(uuid, text, text, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_lookup_external(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_queue_backoff(integer) TO service_role;

REVOKE ALL ON FUNCTION public.ped_outbox_enqueue(uuid, text, jsonb, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_outbox_enqueue(uuid, text, jsonb, uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_replay_dead_letter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_replay_dead_letter(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.ped_integration_metrics(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ped_integration_metrics(uuid) TO authenticated, service_role;