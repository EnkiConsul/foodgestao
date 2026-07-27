ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS last_error_code text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_since timestamptz,
  ADD COLUMN IF NOT EXISTS requires_user_action boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS user_action_type text,
  ADD COLUMN IF NOT EXISTS user_action_detail jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.open_finance_connections
  DROP CONSTRAINT IF EXISTS open_finance_connections_user_action_type_check;
ALTER TABLE public.open_finance_connections
  ADD CONSTRAINT open_finance_connections_user_action_type_check
  CHECK (user_action_type IS NULL OR user_action_type IN ('login_error','mfa_required','consent_expired','account_locked','provider_outage'));

CREATE INDEX IF NOT EXISTS idx_of_connections_requires_action
  ON public.open_finance_connections (company_id)
  WHERE requires_user_action = true;

-- Classifica o estado da conexão a partir do status/executionStatus reportado pela Pluggy
CREATE OR REPLACE FUNCTION public.classify_open_finance_item_state(
  _connection_id uuid,
  _status text,
  _execution_status text,
  _error_code text DEFAULT NULL,
  _error_message text DEFAULT NULL,
  _consent_expires_at timestamptz DEFAULT NULL,
  _parameter jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_needs boolean := false;
  v_code text := coalesce(_error_code, _execution_status, _status);
BEGIN
  IF _status = 'WAITING_USER_INPUT' THEN
    v_action := 'mfa_required';
  ELSIF _execution_status IN ('INVALID_CREDENTIALS','INVALID_CREDENTIALS_MFA','ALREADY_LOGGED_IN','USER_AUTHORIZATION_PENDING','USER_AUTHORIZATION_NOT_GRANTED') THEN
    v_action := 'login_error';
  ELSIF _execution_status IN ('ACCOUNT_LOCKED','ACCOUNT_NEEDS_ACTION') THEN
    v_action := 'account_locked';
  ELSIF _execution_status IN ('USER_INPUT_TIMEOUT','CONNECTION_ERROR','SITE_NOT_AVAILABLE') THEN
    v_action := 'provider_outage';
  ELSIF _status = 'LOGIN_ERROR' THEN
    v_action := 'login_error';
  END IF;

  IF _consent_expires_at IS NOT NULL AND _consent_expires_at <= now() THEN
    v_action := 'consent_expired';
  END IF;

  v_needs := v_action IS NOT NULL AND v_action <> 'provider_outage';

  UPDATE public.open_finance_connections c
     SET status = coalesce(_status, c.status),
         status_detail = coalesce(_execution_status, c.status_detail),
         consent_expires_at = coalesce(_consent_expires_at, c.consent_expires_at),
         requires_user_action = v_needs,
         user_action_type = v_action,
         user_action_detail = coalesce(_parameter, '{}'::jsonb),
         last_error_code = CASE WHEN v_action IS NULL THEN NULL ELSE v_code END,
         last_error = CASE WHEN v_action IS NULL THEN NULL ELSE _error_message END,
         last_error_at = CASE WHEN v_action IS NULL THEN NULL ELSE now() END,
         error_since = CASE
                         WHEN v_action IS NULL THEN NULL
                         WHEN c.error_since IS NULL THEN now()
                         ELSE c.error_since
                       END,
         updated_at = now()
   WHERE c.id = _connection_id;

  RETURN jsonb_build_object('requires_user_action', v_needs, 'user_action_type', v_action);
END;
$$;

REVOKE ALL ON FUNCTION public.classify_open_finance_item_state(uuid,text,text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_open_finance_item_state(uuid,text,text,text,text,timestamptz,jsonb) TO service_role;