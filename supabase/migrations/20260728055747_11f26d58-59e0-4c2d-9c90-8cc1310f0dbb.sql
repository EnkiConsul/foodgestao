
CREATE OR REPLACE FUNCTION public.sync_of_account_balance(
  _account_id uuid,
  _new_balance numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Uso interno pela integração Open Finance (edge functions com service_role).
  -- Habilita a flag do motor financeiro apenas no escopo da transação corrente
  -- para permitir a escrita direta em current_balance/initial_balance.
  PERFORM set_config('app.balance_engine', 'on', true);
  UPDATE public.accounts
     SET current_balance = COALESCE(_new_balance, current_balance),
         initial_balance = CASE
           WHEN COALESCE(initial_balance, 0) = 0 AND COALESCE(current_balance, 0) = 0
             THEN COALESCE(_new_balance, initial_balance)
           ELSE initial_balance
         END,
         updated_at = now()
   WHERE id = _account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_of_account_balance(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_of_account_balance(uuid, numeric) TO service_role;
