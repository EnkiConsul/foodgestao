-- Restrict get_user_plan_features so callers can only query themselves
CREATE OR REPLACE FUNCTION public.get_user_plan_features(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _features jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;
  IF auth.uid() <> _user_id AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT COALESCE(p.features, '{}'::jsonb) INTO _features
  FROM public.subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.user_id = _user_id
    AND s.status IN ('trialing', 'active', 'past_due')
  ORDER BY s.created_at DESC
  LIMIT 1;
  RETURN COALESCE(_features, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;