CREATE OR REPLACE FUNCTION public.prevent_bulk_payment_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _cnt int;
BEGIN
  SELECT count(*) INTO _cnt
  FROM new_rows n
  JOIN old_rows o ON o.id = n.id
  WHERE n.status            IS DISTINCT FROM o.status
     OR n.amount_paid       IS DISTINCT FROM o.amount_paid
     OR n.payment_date      IS DISTINCT FROM o.payment_date
     OR n.bill_status       IS DISTINCT FROM o.bill_status;

  IF _cnt > 1 THEN
    RAISE EXCEPTION 'Os campos de pagamento (status, amount_paid, payment_date, bill_status) só podem ser alterados em uma ocorrência por vez. Use o escopo "somente este" para alterar pagamento de uma transação recorrente.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_bulk_payment_change ON public.transactions;

CREATE TRIGGER trg_prevent_bulk_payment_change
AFTER UPDATE ON public.transactions
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_bulk_payment_change();