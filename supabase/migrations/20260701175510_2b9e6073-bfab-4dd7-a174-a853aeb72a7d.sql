
-- Auto-maintain accounts.current_balance from confirmed transactions
CREATE OR REPLACE FUNCTION public.apply_tx_balance(_tx public.transactions, _sign int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _tx.status <> 'confirmado' THEN RETURN; END IF;

  IF _tx.transaction_type = 'receita' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'despesa' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'transferencia' THEN
    IF _tx.account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
        WHERE id = _tx.account_id;
    END IF;
    IF _tx.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
        WHERE id = _tx.destination_account_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_account_balance_on_tx()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.apply_tx_balance(NEW, 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.apply_tx_balance(OLD, -1);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.apply_tx_balance(OLD, -1);
    PERFORM public.apply_tx_balance(NEW, 1);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_balance ON public.transactions;
CREATE TRIGGER trg_sync_account_balance
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_account_balance_on_tx();

-- One-time reconciliation: rebuild current_balance = initial_balance + sum(confirmed signed)
WITH sums AS (
  SELECT a.id AS account_id,
    a.initial_balance
    + COALESCE((
        SELECT SUM(CASE
          WHEN t.transaction_type = 'receita' THEN t.amount
          WHEN t.transaction_type = 'despesa' THEN -t.amount
          WHEN t.transaction_type = 'transferencia' AND t.account_id = a.id THEN -t.amount
          ELSE 0 END)
        FROM public.transactions t
        WHERE t.status = 'confirmado'
          AND (t.account_id = a.id
               AND t.transaction_type IN ('receita','despesa','transferencia'))
    ), 0)
    + COALESCE((
        SELECT SUM(t.amount)
        FROM public.transactions t
        WHERE t.status = 'confirmado'
          AND t.transaction_type = 'transferencia'
          AND t.destination_account_id = a.id
    ), 0) AS new_balance
  FROM public.accounts a
)
UPDATE public.accounts a
SET current_balance = s.new_balance
FROM sums s
WHERE s.account_id = a.id;
