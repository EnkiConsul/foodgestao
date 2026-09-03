CREATE OR REPLACE FUNCTION public.pluggy_accounts_guard_card_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_company uuid;
BEGIN
  IF NEW.linked_credit_card_id IS NOT NULL THEN
    SELECT company_id INTO v_card_company
    FROM public.credit_cards
    WHERE id = NEW.linked_credit_card_id;

    IF v_card_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'O cartão selecionado pertence a outra empresa. Selecione um cartão da mesma empresa da conta conectada.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_accounts_guard_card_company() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_pluggy_accounts_guard_card_company ON public.pluggy_accounts;
CREATE TRIGGER trg_pluggy_accounts_guard_card_company
BEFORE INSERT OR UPDATE OF linked_credit_card_id, company_id ON public.pluggy_accounts
FOR EACH ROW EXECUTE FUNCTION public.pluggy_accounts_guard_card_company();