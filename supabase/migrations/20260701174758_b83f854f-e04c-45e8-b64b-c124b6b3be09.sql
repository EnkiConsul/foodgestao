CREATE OR REPLACE FUNCTION public.validate_transaction_payment_method()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pm_user uuid;
  _pm_visible_pf boolean;
  _linked boolean;
BEGIN
  IF NEW.payment_method_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id, visible_pf INTO _pm_user, _pm_visible_pf
  FROM public.payment_methods
  WHERE id = NEW.payment_method_id;

  IF _pm_user IS NULL THEN
    RAISE EXCEPTION 'Forma de pagamento não encontrada' USING ERRCODE = '23514';
  END IF;

  IF _pm_user <> NEW.user_id THEN
    RAISE EXCEPTION 'Forma de pagamento não pertence ao usuário' USING ERRCODE = '42501';
  END IF;

  IF NEW.context = 'pj' THEN
    IF NEW.company_id IS NULL THEN
      RAISE EXCEPTION 'Lançamento empresarial requer empresa' USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.payment_method_companies
      WHERE payment_method_id = NEW.payment_method_id
        AND company_id = NEW.company_id
    ) INTO _linked;
    IF NOT _linked THEN
      RAISE EXCEPTION 'Forma de pagamento não está vinculada a esta empresa' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF _pm_visible_pf IS NOT TRUE THEN
      RAISE EXCEPTION 'Forma de pagamento não está disponível no perfil Pessoal' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transaction_payment_method ON public.transactions;
CREATE TRIGGER trg_validate_transaction_payment_method
BEFORE INSERT OR UPDATE OF payment_method_id, context, company_id, user_id
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_transaction_payment_method();