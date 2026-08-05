CREATE OR REPLACE FUNCTION public.ped_worker_nonce_issue(p_purpose text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  DELETE FROM public.ped_worker_nonces WHERE expires_at < now() - interval '1 hour';
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.ped_worker_nonces (token, purpose, expires_at)
  VALUES (v_token, p_purpose, now() + interval '2 minutes');
  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ped_worker_nonce_issue(text) TO PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ped_worker_nonce_issue(text) FROM anon, authenticated;