CREATE OR REPLACE FUNCTION public._e2e_seed_foreign_accounts(_empty_name text, _history_name text)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, foreign_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  other uuid;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _empty_name !~ '^E2E-FOREIGN-' OR _history_name !~ '^E2E-FOREIGN-' THEN
    RAISE EXCEPTION 'names must start with E2E-FOREIGN-';
  END IF;

  SELECT id INTO other FROM auth.users WHERE id <> uid ORDER BY created_at LIMIT 1;
  IF other IS NULL THEN RAISE EXCEPTION 'nao existe outro usuario para simular acesso nao autorizado'; END IF;

  INSERT INTO public.accounts (user_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (other, _empty_name, 'corrente', 'pf', 0, 0, true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts (user_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (other, _history_name, 'corrente', 'pf', 0, 0, true)
    RETURNING id INTO a_hist;
  INSERT INTO public.transactions
    (user_id, account_id, context, transaction_type,
     description, amount, transaction_date, status)
    VALUES (other, a_hist, 'pf', 'receita', 'e2e foreign seed', 10, current_date, 'confirmado')
    RETURNING id INTO t_id;

  RETURN QUERY SELECT a_empty, a_hist, t_id, other;
END $$;

REVOKE ALL ON FUNCTION public._e2e_seed_foreign_accounts(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_seed_foreign_accounts(text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._e2e_cleanup_foreign_accounts(_empty_name text, _history_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _empty_name !~ '^E2E-FOREIGN-' OR _history_name !~ '^E2E-FOREIGN-' THEN
    RAISE EXCEPTION 'names must start with E2E-FOREIGN-';
  END IF;
  DELETE FROM public.transactions
   WHERE description = 'e2e foreign seed'
     AND account_id IN (SELECT id FROM public.accounts WHERE name IN (_empty_name, _history_name));
  DELETE FROM public.accounts WHERE name IN (_empty_name, _history_name);
END $$;

REVOKE ALL ON FUNCTION public._e2e_cleanup_foreign_accounts(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_foreign_accounts(text,text) TO authenticated, service_role;