CREATE OR REPLACE FUNCTION public.dp_portal_acesso_status(p_colaborador_id uuid)
RETURNS TABLE (status text, expires_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_colab record;
  v_state record;
  v_token record;
BEGIN
  SELECT id, user_id, company_id INTO v_colab
    FROM public.dp_colaboradores WHERE id = p_colaborador_id;
  IF v_colab.id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    private.is_company_admin_or_owner(auth.uid(), v_colab.company_id)
    OR public.has_role(auth.uid(), 'super_admin')
  ) THEN
    RETURN;
  END IF;

  IF v_colab.user_id IS NULL THEN
    RETURN QUERY SELECT 'sem_acesso'::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_state
    FROM public.auth_user_security_state WHERE user_id = v_colab.user_id;

  IF COALESCE(v_state.access_blocked, false) THEN
    RETURN QUERY SELECT 'bloqueado'::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT t.purpose, t.expires_at INTO v_token
    FROM public.dp_portal_access_tokens t
   WHERE t.user_id = v_colab.user_id
     AND t.consumed_at IS NULL
     AND t.expires_at > now()
   ORDER BY t.created_at DESC
   LIMIT 1;

  IF v_token.purpose = 'reset' THEN
    RETURN QUERY SELECT 'reset_solicitado'::text, v_token.expires_at;
    RETURN;
  ELSIF v_token.purpose = 'activation' THEN
    RETURN QUERY SELECT 'pendente_ativacao'::text, v_token.expires_at;
    RETURN;
  END IF;

  IF COALESCE(v_state.must_change_password, false) OR v_state.password_changed_at IS NULL THEN
    RETURN QUERY SELECT 'pendente_ativacao'::text, NULL::timestamptz;
  ELSE
    RETURN QUERY SELECT 'ativo'::text, NULL::timestamptz;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.dp_portal_acesso_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_portal_acesso_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_portal_acesso_status(uuid) TO service_role;