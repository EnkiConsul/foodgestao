
CREATE OR REPLACE FUNCTION public._e2e_seed_adjust_balance(_account_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id  uuid;
  _company_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  -- Detecta empresa ativa (owner ou membro) do caller.
  SELECT c.id INTO _company_id
    FROM public.companies c
   WHERE c.is_active = true
     AND (c.user_id = _uid
          OR EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = c.id AND m.user_id = _uid))
   ORDER BY c.created_at ASC
   LIMIT 1;

  PERFORM set_config('app.balance_engine', 'on', true);
  IF _company_id IS NULL THEN
    INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance)
    VALUES (_uid, _account_name, 'corrente', 'pf', 100, 100)
    RETURNING id INTO _id;
  ELSE
    INSERT INTO public.accounts (user_id, company_id, name, account_type, context, initial_balance, current_balance)
    VALUES (_uid, _company_id, _account_name, 'corrente', 'pj', 100, 100)
    RETURNING id INTO _id;
  END IF;
  PERFORM set_config('app.balance_engine', '', true);

  RETURN _id;
END $$;
