
-- 1) Sinaliza necessidade de reconexão manual (LOGIN_ERROR/WAITING_USER_INPUT/OUTDATED)
ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS needs_reconnect boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS of_conn_needs_reconnect_idx
  ON public.open_finance_connections(company_id)
  WHERE needs_reconnect = true;

-- 2) RPC de reivindicação em lote com SKIP LOCKED
CREATE OR REPLACE FUNCTION public.claim_pluggy_webhook_events(
  _batch integer DEFAULT 10,
  _now timestamptz DEFAULT now()
) RETURNS TABLE (
  id uuid,
  event_type text,
  provider_item_id text,
  provider_account_id text,
  connection_id uuid,
  company_id uuid,
  attempt_count integer,
  payload jsonb
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM public.open_finance_webhook_events e
     WHERE e.provider = 'pluggy'
       AND e.status IN ('pending','retry')
       AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= _now)
     ORDER BY e.received_at ASC
     LIMIT GREATEST(1, LEAST(_batch, 50))
     FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.open_finance_webhook_events e
       SET status = 'processing',
           processing_started_at = _now
      FROM picked
     WHERE e.id = picked.id
    RETURNING e.id, e.event_type, e.provider_item_id, e.provider_account_id,
              e.connection_id, e.company_id, e.attempt_count, e.payload
  )
  SELECT u.id, u.event_type, u.provider_item_id, u.provider_account_id,
         u.connection_id, u.company_id, u.attempt_count, u.payload
    FROM updated u;
END $$;

REVOKE ALL ON FUNCTION public.claim_pluggy_webhook_events(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pluggy_webhook_events(integer, timestamptz)
  TO service_role;
