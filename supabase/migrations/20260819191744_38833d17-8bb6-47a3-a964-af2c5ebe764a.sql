CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_id uuid;
  _trial_days integer;
BEGIN
  -- Preferred entry plan: an active "free" plan
  SELECT id, COALESCE(trial_days, 0) INTO _plan_id, _trial_days
  FROM public.plans
  WHERE slug = 'free' AND is_active = true
  LIMIT 1;

  -- Fallback: first active plan by sort order
  IF _plan_id IS NULL THEN
    SELECT id, COALESCE(trial_days, 0) INTO _plan_id, _trial_days
    FROM public.plans
    WHERE is_active = true
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT 1;
  END IF;

  -- Last resort: any plan at all
  IF _plan_id IS NULL THEN
    SELECT id, COALESCE(trial_days, 0) INTO _plan_id, _trial_days
    FROM public.plans
    ORDER BY sort_order NULLS LAST, created_at
    LIMIT 1;
  END IF;

  IF _plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan_id, status, trial_ends_at, current_period_end
    ) VALUES (
      NEW.id,
      _plan_id,
      CASE WHEN _trial_days > 0 THEN 'trialing'::subscription_status ELSE 'active'::subscription_status END,
      CASE WHEN _trial_days > 0 THEN now() + (_trial_days || ' days')::interval ELSE NULL END,
      now() + interval '1 month'
    );
  EXCEPTION WHEN unique_violation THEN
    NULL; -- subscription already exists for this user
  END;

  RETURN NEW;
END;
$$;