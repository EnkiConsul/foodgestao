CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _plan_id uuid; _dias integer; _acc uuid; _mod text; _doc text; _sub uuid;
BEGIN
  IF lower(COALESCE(NEW.email,'')) LIKE '%@portal.360food.local' THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.company_invites i
             WHERE lower(i.invited_email) = lower(NEW.email) AND i.status::text = 'pending') THEN
    RETURN NEW;
  END IF;
  _mod := CASE WHEN NEW.raw_user_meta_data->>'trial_module' = 'pessoas' THEN 'pessoas' ELSE 'financeiro' END;
  _doc := public.billing_v2_digits(COALESCE(NEW.raw_user_meta_data->>'cpf', NEW.raw_user_meta_data->>'document'));
  IF EXISTS (SELECT 1 FROM trial_usage t WHERE lower(t.email) = lower(NEW.email)
               OR (_doc IS NOT NULL AND t.documento_titular = _doc)) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO _plan_id FROM public.plans WHERE slug = _mod || '-gestao' AND is_active LIMIT 1;
  IF _plan_id IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE((value #>> '{}')::int, 7) INTO _dias FROM system_parameters WHERE key = 'trial_cadastro_dias';
  _dias := COALESCE(_dias, 7);
  IF _dias <= 0 THEN RETURN NEW; END IF;
  BEGIN
    _acc := public.billing_v2_user_empty_account(NEW.id, true);
    INSERT INTO public.subscriptions (user_id, plan_id, module, status, trial_ends_at, current_period_end, billing_account_id)
    VALUES (NEW.id, _plan_id, _mod, 'trialing', now() + make_interval(days => _dias), now() + make_interval(days => _dias), _acc)
    RETURNING id INTO _sub;
    INSERT INTO trial_usage(titular_user_id, email, documento_titular, module, plan_id, subscription_id, started_at, ends_at)
    VALUES (NEW.id, lower(NEW.email), _doc, _mod, _plan_id, _sub, now(), now() + make_interval(days => _dias));
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  RETURN NEW;
END $function$;