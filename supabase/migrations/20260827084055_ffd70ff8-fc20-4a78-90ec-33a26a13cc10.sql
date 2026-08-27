-- 1) Expiração atômica de trials + isenções
CREATE OR REPLACE FUNCTION public.expire_trials_and_exemptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trials int := 0;
  v_exempt int := 0;
BEGIN
  WITH upd AS (
    UPDATE public.subscriptions
       SET status = 'expired', updated_at = now()
     WHERE status = 'trialing'
       AND trial_ends_at IS NOT NULL
       AND trial_ends_at < now()
    RETURNING id
  )
  SELECT count(*) INTO v_trials FROM upd;

  WITH upd2 AS (
    UPDATE public.subscriptions
       SET is_exempt = false,
           exempt_until = NULL,
           status = 'past_due',
           updated_at = now()
     WHERE is_exempt = true
       AND exempt_until IS NOT NULL
       AND exempt_until < now()
    RETURNING id
  )
  SELECT count(*) INTO v_exempt FROM upd2;

  RETURN jsonb_build_object('expired_count', v_trials, 'exemptions_expired', v_exempt);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_trials_and_exemptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_trials_and_exemptions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_trials_and_exemptions() TO service_role;

-- 2) Consumo atômico (uso único) do reset token
CREATE OR REPLACE FUNCTION public.consume_recovery_reset(
  p_challenge_id uuid,
  p_reset_token_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  UPDATE public.auth_recovery_challenges
     SET status = 'completed',
         completed_at = now(),
         reset_token_hash = NULL,
         reset_token_expires_at = NULL,
         updated_at = now()
   WHERE id = p_challenge_id
     AND status = 'verified'
     AND user_id IS NOT NULL
     AND reset_token_hash IS NOT NULL
     AND reset_token_expires_at IS NOT NULL
     AND reset_token_expires_at > now()
     AND reset_token_hash = p_reset_token_hash
  RETURNING user_id INTO v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_recovery_reset(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_recovery_reset(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_recovery_reset(uuid, text) TO service_role;

-- 2b) Finalização: limpa flag de troca obrigatória de senha
CREATE OR REPLACE FUNCTION public.finalize_recovery_reset(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.auth_user_security_state
     SET must_change_password = false,
         password_changed_at = now()
   WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_recovery_reset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_recovery_reset(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_recovery_reset(uuid) TO service_role;

-- 2c) Invalidação do desafio quando a troca de senha falha
CREATE OR REPLACE FUNCTION public.fail_recovery_reset(p_challenge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.auth_recovery_challenges
     SET status = 'blocked',
         reset_token_hash = NULL,
         reset_token_expires_at = NULL,
         updated_at = now()
   WHERE id = p_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_recovery_reset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_recovery_reset(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_recovery_reset(uuid) TO service_role;

-- 3) Incremento atômico de tentativas de OTP
CREATE OR REPLACE FUNCTION public.increment_recovery_attempt(
  p_challenge_id uuid,
  p_max_attempts int DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_status text;
BEGIN
  UPDATE public.auth_recovery_challenges
     SET otp_attempt_count = COALESCE(otp_attempt_count, 0) + 1,
         status = CASE
           WHEN COALESCE(otp_attempt_count, 0) + 1 >= p_max_attempts THEN 'blocked'
           ELSE status
         END,
         updated_at = now()
   WHERE id = p_challenge_id
  RETURNING otp_attempt_count, status INTO v_count, v_status;

  RETURN jsonb_build_object('attempt_count', COALESCE(v_count, 0), 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_recovery_attempt(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_recovery_attempt(uuid, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_recovery_attempt(uuid, int) TO service_role;