CREATE OR REPLACE FUNCTION public._e2e_seed_delete_accounts(_empty_name text, _history_name text)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _empty_name !~ '^E2E-' OR _history_name !~ '^E2E-' THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;
  INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, _empty_name, 'corrente', 'pf', 0, 0, true) RETURNING id INTO a_empty;
  INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, _history_name, 'corrente', 'pf', 0, 0, true) RETURNING id INTO a_hist;
  INSERT INTO public.transactions
    (user_id, account_id, context, transaction_type, description, amount, transaction_date, status)
    VALUES (uid, a_hist, 'pf', 'receita', 'e2e seed', 10, current_date, 'confirmado')
    RETURNING id INTO t_id;
  RETURN QUERY SELECT a_empty, a_hist, t_id;
END $$;

CREATE OR REPLACE FUNCTION public._e2e_cleanup_delete_accounts(_names text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_names) n WHERE n !~ '^E2E-') THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;
  DELETE FROM public.transactions
   WHERE user_id = uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = uid AND name = ANY(_names));
  DELETE FROM public.accounts WHERE user_id = uid AND name = ANY(_names);
END $$;

REVOKE ALL ON FUNCTION public._e2e_seed_delete_accounts(text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._e2e_cleanup_delete_accounts(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_seed_delete_accounts(text,text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_delete_accounts(text[])    TO authenticated, service_role;