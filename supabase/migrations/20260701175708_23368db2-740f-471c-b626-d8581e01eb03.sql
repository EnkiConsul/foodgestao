
CREATE OR REPLACE FUNCTION public.validate_transaction_destination_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _dest RECORD;
BEGIN
  IF NEW.transaction_type <> 'transferencia' THEN
    -- Non-transfer transactions must not carry a destination
    IF NEW.destination_account_id IS NOT NULL THEN
      NEW.destination_account_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.destination_account_id IS NULL THEN
    RAISE EXCEPTION 'Transferência requer conta de destino' USING ERRCODE = '23514';
  END IF;

  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'Transferência requer conta de origem' USING ERRCODE = '23514';
  END IF;

  IF NEW.destination_account_id = NEW.account_id THEN
    RAISE EXCEPTION 'Conta de destino deve ser diferente da conta de origem' USING ERRCODE = '23514';
  END IF;

  SELECT user_id, context, company_id, is_active
    INTO _dest
  FROM public.accounts
  WHERE id = NEW.destination_account_id;

  IF _dest IS NULL THEN
    RAISE EXCEPTION 'Conta de destino não encontrada' USING ERRCODE = '23514';
  END IF;

  IF _dest.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'Conta de destino não pertence ao usuário' USING ERRCODE = '42501';
  END IF;

  IF _dest.context <> NEW.context THEN
    RAISE EXCEPTION 'Conta de destino não pertence ao perfil de acesso ativo' USING ERRCODE = '42501';
  END IF;

  IF NEW.context = 'pj' THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Transferência empresarial requer empresa' USING ERRCODE = '23514';
    END IF;
    IF _dest.company_id IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'Conta de destino não pertence à mesma empresa do lançamento' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF _dest.company_id IS NOT NULL THEN
      RAISE EXCEPTION 'Conta de destino não pertence ao perfil Pessoal' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transaction_destination_account ON public.transactions;
CREATE TRIGGER trg_validate_transaction_destination_account
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_destination_account();
