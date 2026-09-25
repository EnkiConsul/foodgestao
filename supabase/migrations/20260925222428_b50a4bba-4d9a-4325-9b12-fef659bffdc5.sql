ALTER TABLE public.auth_user_security_state
  ADD COLUMN IF NOT EXISTS active_session_id text,
  ADD COLUMN IF NOT EXISTS active_session_at timestamptz,
  ADD COLUMN IF NOT EXISTS active_session_device text;

COMMENT ON COLUMN public.auth_user_security_state.active_session_id IS 'Sessão (aparelho) atualmente ativa para o usuário. Sessão única: um login por vez.';

CREATE OR REPLACE FUNCTION public.auth_sessao_assumir(_session_id text, _device text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_at timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao autenticado';
  END IF;
  IF _session_id IS NULL OR length(btrim(_session_id)) < 8 OR length(_session_id) > 128 THEN
    RAISE EXCEPTION 'sessao invalida';
  END IF;

  INSERT INTO public.auth_user_security_state (user_id, active_session_id, active_session_at, active_session_device, created_at, updated_at)
  VALUES (v_uid, btrim(_session_id), v_at, left(coalesce(_device, ''), 200), v_at, v_at)
  ON CONFLICT (user_id) DO UPDATE
    SET active_session_id = EXCLUDED.active_session_id,
        active_session_at = EXCLUDED.active_session_at,
        active_session_device = EXCLUDED.active_session_device,
        updated_at = v_at;

  RETURN v_at;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_sessao_assumir(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_sessao_assumir(text, text) TO authenticated;

ALTER TABLE public.auth_user_security_state REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'auth_user_security_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_user_security_state;
  END IF;
END $$;