CREATE TABLE public.ped_worker_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.ped_worker_nonces TO service_role;
ALTER TABLE public.ped_worker_nonces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ped_worker_nonces_no_client_access" ON public.ped_worker_nonces
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE INDEX idx_ped_worker_nonces_expires ON public.ped_worker_nonces (expires_at);

CREATE OR REPLACE FUNCTION public.ped_worker_nonce_issue(p_purpose text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  DELETE FROM public.ped_worker_nonces WHERE expires_at < now() - interval '1 hour';
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.ped_worker_nonces (token, purpose, expires_at)
  VALUES (v_token, p_purpose, now() + interval '2 minutes');
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.ped_worker_nonce_consume(p_token text, p_purpose text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE public.ped_worker_nonces
     SET used_at = now()
   WHERE token = p_token
     AND purpose = p_purpose
     AND used_at IS NULL
     AND expires_at > now()
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ped_worker_nonce_issue(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ped_worker_nonce_consume(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ped_worker_nonce_issue(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ped_worker_nonce_consume(text, text) TO service_role;