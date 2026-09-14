CREATE TABLE IF NOT EXISTS private.dp_bulk_worker_auth (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.dp_bulk_worker_auth FROM PUBLIC;

INSERT INTO private.dp_bulk_worker_auth (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dp_bulk_worker_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v text;
BEGIN
  PERFORM private.dp_bulk_assert_service();
  SELECT secret INTO v FROM private.dp_bulk_worker_auth WHERE id LIMIT 1;
  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM anon;
REVOKE ALL ON FUNCTION public.dp_bulk_worker_secret() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_bulk_worker_secret() TO service_role;