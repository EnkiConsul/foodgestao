-- 1) Convidado pode ver os próprios convites (pelo e-mail autenticado)
CREATE POLICY "Invited user can view own invites"
ON public.company_invites
FOR SELECT
TO authenticated
USING (lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

GRANT SELECT ON public.company_invites TO authenticated;

-- 2) Situação de acesso da empresa, baseada na assinatura do DONO
CREATE OR REPLACE FUNCTION public.company_access_status(_company_id uuid)
RETURNS TABLE (
  company_id uuid,
  is_owner boolean,
  status text,
  trial_ends_at timestamptz,
  blocked boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_trial timestamptz;
  v_blocked boolean;
BEGIN
  IF v_uid IS NULL OR _company_id IS NULL THEN
    RETURN;
  END IF;

  SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = _company_id;
  IF v_owner IS NULL THEN
    RETURN;
  END IF;

  -- só quem tem vínculo com a empresa pode consultar
  IF v_owner <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = _company_id AND m.user_id = v_uid
  ) THEN
    RETURN;
  END IF;

  SELECT s.status::text, s.trial_ends_at
    INTO v_status, v_trial
  FROM public.subscriptions s
  WHERE s.user_id = v_owner
  ORDER BY s.created_at DESC
  LIMIT 1;

  v_blocked := CASE
    WHEN v_status IS NULL THEN false
    WHEN v_status IN ('expired', 'canceled') THEN true
    WHEN v_status = 'trialing' AND v_trial IS NOT NULL AND v_trial < now() THEN true
    ELSE false
  END;

  RETURN QUERY SELECT _company_id, (v_owner = v_uid), v_status, v_trial, v_blocked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.company_access_status(uuid) TO authenticated;