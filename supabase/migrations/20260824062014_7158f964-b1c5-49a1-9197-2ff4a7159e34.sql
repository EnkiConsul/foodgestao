ALTER TABLE public.pluggy_connect_requests
  DROP CONSTRAINT IF EXISTS pluggy_connect_requests_status_chk;

ALTER TABLE public.pluggy_connect_requests
  ADD CONSTRAINT pluggy_connect_requests_status_chk
  CHECK (status = ANY (ARRAY['open'::text, 'completed'::text, 'expired'::text, 'error'::text, 'cancelled'::text]));

CREATE OR REPLACE FUNCTION public.pluggy_cancel_connect_requests(
  _company_id uuid,
  _request_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.pluggy_connect_requests
     SET status = 'cancelled',
         completed_at = now(),
         updated_at = now()
   WHERE company_id = _company_id
     AND status = 'open'
     AND (_request_id IS NULL OR id = _request_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_cancel_connect_requests(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_cancel_connect_requests(uuid, uuid) TO authenticated;