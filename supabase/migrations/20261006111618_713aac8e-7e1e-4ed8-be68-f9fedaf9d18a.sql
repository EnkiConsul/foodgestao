CREATE OR REPLACE FUNCTION public.company_grace_subscriptions(_company_id uuid)
RETURNS TABLE(subscription_id uuid, module text, grace_ends_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_owner uuid;
BEGIN
  IF v_uid IS NULL OR _company_id IS NULL THEN RETURN; END IF;
  SELECT c.user_id INTO v_owner FROM public.companies c WHERE c.id = _company_id;
  IF v_owner IS NULL THEN RETURN; END IF;
  IF v_owner <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.company_members m WHERE m.company_id = _company_id AND m.user_id = v_uid
  ) THEN RETURN; END IF;
  RETURN QUERY
    SELECT s.id, s.module::text, s.grace_ends_at
    FROM public.subscriptions s
    WHERE s.user_id = v_owner AND s.status::text = 'grace'
      AND s.grace_ends_at IS NOT NULL AND s.grace_ends_at >= now()
    ORDER BY s.grace_ends_at ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.company_grace_subscriptions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.company_grace_subscriptions(uuid) TO authenticated, service_role;