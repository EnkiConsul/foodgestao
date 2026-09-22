CREATE OR REPLACE FUNCTION public.sync_of_account_balance(_account_id uuid, _new_balance numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_initial numeric;
  v_current numeric;
  v_has_tx boolean;
BEGIN
  IF _new_balance IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(initial_balance, 0), COALESCE(current_balance, 0)
    INTO v_initial, v_current
    FROM public.accounts
   WHERE id = _account_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE (account_id = _account_id OR destination_account_id = _account_id)
       AND status = 'confirmado'
  ) INTO v_has_tx;

  v_has_tx := v_has_tx OR EXISTS(SELECT 1 FROM public.transaction_payments WHERE account_id=_account_id);
  IF v_initial = 0 AND v_current = 0 AND NOT v_has_tx THEN
    -- Conta recém-conectada e sem razão: o saldo do banco semeia o saldo inicial.
    PERFORM set_config('app.balance_engine', 'on', true);
    UPDATE public.accounts
       SET initial_balance = _new_balance,
           current_balance = _new_balance,
           bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  ELSE
    -- Razão é a fonte da verdade: o banco fica apenas como referência.
    UPDATE public.accounts
       SET bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  END IF;
END;
$function$;
