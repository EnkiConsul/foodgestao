
-- 1) Resolve identifier: CPF -> synthetic email; email -> email
CREATE OR REPLACE FUNCTION public.resolve_login_identifier(_identifier text)
RETURNS TABLE(email text, source text, user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clean text;
  _digits text;
BEGIN
  _clean := lower(btrim(coalesce(_identifier, '')));
  IF _clean = '' THEN RETURN; END IF;

  IF position('@' IN _clean) > 0 THEN
    RETURN QUERY
      SELECT u.email::text, 'email'::text, u.id
      FROM auth.users u
      WHERE lower(u.email) = _clean
      LIMIT 1;
    RETURN;
  END IF;

  _digits := regexp_replace(_clean, '\D', '', 'g');
  IF length(_digits) <> 11 THEN RETURN; END IF;

  RETURN QUERY
    SELECT ('cpf' || _digits || '@portal.360food.local')::text,
           'cpf'::text,
           c.user_id
    FROM public.dp_colaboradores c
    WHERE c.cpf = _digits
      AND c.user_id IS NOT NULL
      AND coalesce(c.ativo, true) = true
    LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_login_identifier(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_login_identifier(text) TO service_role;

-- 2) Record login attempt using existing (bucket, key_hash, window_start) schema
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  _identifier_hash text,
  _ip text,
  _success boolean
)
RETURNS TABLE(blocked boolean, retry_after_seconds int, attempts int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _window_len interval := interval '15 minutes';
  _max int := 8;
  _window_start timestamptz;
  _bucket text;
  _key text;
  _cnt int;
BEGIN
  _bucket := 'login';
  _key := coalesce(nullif(_identifier_hash, ''), 'ip:' || coalesce(_ip, 'unknown'));
  _window_start := date_trunc('minute', _now) - (extract(minute FROM _now)::int % 15) * interval '1 minute';

  IF _success THEN
    -- On success, do not add to failure count; return current state
    SELECT count INTO _cnt
      FROM public.auth_rate_limits
     WHERE bucket = _bucket AND key_hash = _key AND window_start = _window_start;
    _cnt := coalesce(_cnt, 0);
  ELSE
    INSERT INTO public.auth_rate_limits(bucket, key_hash, window_start, count, last_seen_at)
    VALUES (_bucket, _key, _window_start, 1, _now)
    ON CONFLICT (bucket, key_hash, window_start)
    DO UPDATE SET count = auth_rate_limits.count + 1, last_seen_at = EXCLUDED.last_seen_at
    RETURNING count INTO _cnt;
  END IF;

  blocked := _cnt >= _max;
  retry_after_seconds := CASE WHEN blocked
    THEN GREATEST(1, extract(epoch FROM (_window_start + _window_len) - _now)::int)
    ELSE 0 END;
  attempts := _cnt;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.record_login_attempt(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, boolean) TO service_role;

-- 3) Password-change-required helper
CREATE OR REPLACE FUNCTION public.get_password_change_required(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(s.must_change_password, false)
  FROM public.auth_user_security_state s
  WHERE s.user_id = _user_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_password_change_required(uuid) TO authenticated, service_role;

-- 4) Trigger to auto-create the security-state row for every new auth user
CREATE OR REPLACE FUNCTION public.ensure_auth_user_security_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.auth_user_security_state(user_id, must_change_password, created_at, updated_at)
  VALUES (NEW.id, false, now(), now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_auth_user_security_state ON auth.users;
CREATE TRIGGER trg_ensure_auth_user_security_state
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_auth_user_security_state();
