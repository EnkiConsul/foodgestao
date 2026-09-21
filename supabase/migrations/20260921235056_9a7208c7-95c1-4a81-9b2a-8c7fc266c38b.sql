ALTER TABLE public.auth_user_security_state
  ADD COLUMN IF NOT EXISTS mfa_nudge_opt_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_nudge_last_shown_at timestamptz;

COMMENT ON COLUMN public.auth_user_security_state.mfa_nudge_opt_out IS 'Usuário marcou "Não mostrar novamente" no aviso opcional de 2FA.';
COMMENT ON COLUMN public.auth_user_security_state.mfa_nudge_last_shown_at IS 'Última vez que o aviso opcional de 2FA foi exibido para o usuário.';

CREATE OR REPLACE FUNCTION public.fn_mfa_nudge_estado()
RETURNS TABLE (opt_out boolean, last_shown_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(s.mfa_nudge_opt_out, false), s.mfa_nudge_last_shown_at
  FROM public.auth_user_security_state s
  WHERE s.user_id = auth.uid()
  UNION ALL
  SELECT false, NULL::timestamptz
  WHERE auth.uid() IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.auth_user_security_state s2 WHERE s2.user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.fn_mfa_nudge_registrar(_opt_out boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_antes boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT mfa_nudge_opt_out INTO v_antes
  FROM public.auth_user_security_state
  WHERE user_id = v_uid;

  INSERT INTO public.auth_user_security_state (user_id, mfa_nudge_opt_out, mfa_nudge_last_shown_at, created_at, updated_at)
  VALUES (v_uid, COALESCE(_opt_out, false), now(), now(), now())
  ON CONFLICT (user_id) DO UPDATE
    SET mfa_nudge_opt_out = public.auth_user_security_state.mfa_nudge_opt_out OR COALESCE(EXCLUDED.mfa_nudge_opt_out, false),
        mfa_nudge_last_shown_at = now(),
        updated_at = now();

  IF COALESCE(_opt_out, false) AND NOT COALESCE(v_antes, false) THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'mfa_nudge_optout', 'auth', v_uid, jsonb_build_object('origem', 'aviso_2fa'));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_mfa_nudge_estado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_mfa_nudge_registrar(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_mfa_nudge_estado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_mfa_nudge_registrar(boolean) TO authenticated;