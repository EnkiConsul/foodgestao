ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exempt_until timestamptz,
  ADD COLUMN IF NOT EXISTS exempt_reason text,
  ADD COLUMN IF NOT EXISTS exempted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exempted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_subscriptions_is_exempt ON public.subscriptions(is_exempt) WHERE is_exempt = true;

-- Update plan features lookup to consider exempt subscriptions as still entitled
CREATE OR REPLACE FUNCTION public.get_user_plan_features(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND (
      s.status IN ('trialing', 'active', 'past_due')
      OR (s.is_exempt = true AND (s.exempt_until IS NULL OR s.exempt_until > now()))
    )
  ORDER BY s.created_at DESC
  LIMIT 1;
  RETURN COALESCE(_features, '{}'::jsonb);
END;
$function$;