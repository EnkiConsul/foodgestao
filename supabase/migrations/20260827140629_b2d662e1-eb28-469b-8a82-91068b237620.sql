CREATE OR REPLACE FUNCTION public.webhook_requeue_admin(_provider text, _event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _provider = 'asaas' THEN
    UPDATE public.asaas_webhook_events
    SET status = 'pending',
        attempt_count = 0,
        next_attempt_at = now(),
        locked_by = NULL,
        claim_expires_at = NULL,
        dead_lettered_at = NULL,
        error = NULL,
        error_code = NULL,
        processed_at = NULL,
        updated_at = now()
    WHERE id = _event_id;
  ELSIF _provider = 'pluggy' THEN
    UPDATE public.pluggy_webhook_events
    SET status = 'pending',
        attempt_count = 0,
        next_attempt_at = now(),
        locked_by = NULL,
        claim_expires_at = NULL,
        dead_lettered_at = NULL,
        error = NULL,
        error_code = NULL,
        processed_at = NULL,
        updated_at = now()
    WHERE id = _event_id;
  ELSE
    RAISE EXCEPTION 'invalid provider';
  END IF;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.webhook_requeue_admin(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webhook_requeue_admin(text, uuid) TO authenticated, service_role;