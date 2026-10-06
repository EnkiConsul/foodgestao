CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _plan_id uuid; _trial_days integer; _acc uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local'
     OR EXISTS (SELECT 1 FROM public.company_invites i
                WHERE lower(i.invited_email) = lower(NEW.email) AND i.status::text = 'pending') THEN
    RETURN NEW;
  END IF;
  SELECT id, COALESCE(trial_days, 7) INTO _plan_id, _trial_days
  FROM public.plans WHERE slug = 'financeiro-gestao' AND is_active LIMIT 1;
  IF _plan_id IS NULL THEN
    SELECT id, COALESCE(trial_days, 7) INTO _plan_id, _trial_days
    FROM public.plans WHERE is_active AND module = 'financeiro' AND NOT is_enterprise
    ORDER BY sort_order, created_at LIMIT 1;
  END IF;
  IF _plan_id IS NULL THEN RETURN NEW; END IF;
  BEGIN
    _acc := public.billing_v2_user_empty_account(NEW.id, true);
    INSERT INTO public.subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
    VALUES (NEW.id, _plan_id, 'financeiro',
      CASE WHEN _trial_days > 0 THEN 'trialing'::subscription_status ELSE 'active'::subscription_status END,
      CASE WHEN _trial_days > 0 THEN now() + (_trial_days || ' days')::interval ELSE NULL END,
      now() + interval '1 month', _acc);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END $$;