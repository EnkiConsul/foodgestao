DROP FUNCTION IF EXISTS public._e2e_seed_delete_accounts(text, text);
CREATE FUNCTION public._e2e_seed_delete_accounts(_empty_name text, _history_name text)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
  ctx context_type;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _empty_name !~ '^E2E-' OR _history_name !~ '^E2E-' THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;

  SELECT c.id INTO cid
    FROM public.companies c
   WHERE c.user_id = uid AND c.is_active = true
   ORDER BY c.created_at
   LIMIT 1;
  ctx := CASE WHEN cid IS NULL THEN 'pf'::context_type ELSE 'pj'::context_type END;

  INSERT INTO public.accounts (user_id, company_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (uid, cid, _empty_name,   'corrente', ctx, 0, 0, true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts (user_id, company_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (uid, cid, _history_name, 'corrente', ctx, 0, 0, true)
    RETURNING id INTO a_hist;
  INSERT INTO public.transactions
    (user_id, company_id, account_id, context, transaction_type,
     description, amount, transaction_date, status)
    VALUES (uid, cid, a_hist, ctx, 'receita', 'e2e seed', 10, current_date, 'confirmado')
    RETURNING id INTO t_id;

  RETURN QUERY SELECT a_empty, a_hist, t_id, cid;
END $$;

REVOKE ALL ON FUNCTION public._e2e_seed_delete_accounts(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_seed_delete_accounts(text,text) TO authenticated, service_role;