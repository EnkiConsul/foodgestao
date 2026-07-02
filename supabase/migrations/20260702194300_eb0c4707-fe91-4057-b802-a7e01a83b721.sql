
-- Recompute account balances from confirmed transactions
CREATE OR REPLACE FUNCTION public.recompute_account_balance(_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _acc public.accounts;
  _movements numeric;
  _new_balance numeric;
BEGIN
  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id;
  IF _acc IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _acc.user_id <> auth.uid()
     AND NOT public.is_super_admin(auth.uid())
     AND NOT (
       _acc.context = 'pj' AND _acc.company_id IS NOT NULL
       AND private.is_company_member(auth.uid(), _acc.company_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type = 'receita'      AND t.account_id = _account_id THEN t.amount
      WHEN t.transaction_type = 'despesa'      AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = _account_id THEN t.amount
      ELSE 0
    END
  ), 0)
  INTO _movements
  FROM public.transactions t
  WHERE t.status = 'confirmado'
    AND (t.account_id = _account_id OR t.destination_account_id = _account_id);

  _new_balance := COALESCE(_acc.initial_balance, 0) + _movements;

  UPDATE public.accounts
     SET current_balance = _new_balance
   WHERE id = _account_id;

  RETURN _new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_account_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_account_balance(uuid) TO authenticated, service_role;

-- Recompute all accessible accounts for the current user (or all when super admin)
CREATE OR REPLACE FUNCTION public.recompute_all_account_balances()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean := false;
  _count int := 0;
  _rec record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  _is_admin := public.is_super_admin(_uid);

  FOR _rec IN
    SELECT a.id
    FROM public.accounts a
    WHERE _is_admin
       OR a.user_id = _uid
       OR (a.context = 'pj' AND a.company_id IS NOT NULL
           AND private.is_company_member(_uid, a.company_id))
  LOOP
    PERFORM public.recompute_account_balance(_rec.id);
    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_all_account_balances() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recompute_all_account_balances() TO authenticated, service_role;

-- One-off resync of all account balances now (fixes any historical drift).
DO $$
DECLARE _rec record;
BEGIN
  FOR _rec IN SELECT id FROM public.accounts LOOP
    PERFORM public.recompute_account_balance(_rec.id);
  END LOOP;
END $$;
