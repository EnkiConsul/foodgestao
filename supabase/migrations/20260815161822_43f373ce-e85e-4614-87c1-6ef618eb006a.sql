CREATE OR REPLACE FUNCTION public.seed_default_account_on_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounts
    WHERE company_id = NEW.id AND context = 'pj'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.accounts (
    user_id, company_id, name, account_type, context,
    initial_balance, current_balance, is_active
  ) VALUES (
    NEW.user_id, NEW.id, 'Caixa', 'dinheiro'::public.account_type, 'pj'::public.context_type,
    0, 0, true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_account_on_company ON public.companies;
CREATE TRIGGER trg_seed_default_account_on_company
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.seed_default_account_on_company();

INSERT INTO public.accounts (
  user_id, company_id, name, account_type, context,
  initial_balance, current_balance, is_active
)
SELECT c.user_id, c.id, 'Caixa', 'dinheiro'::public.account_type, 'pj'::public.context_type, 0, 0, true
FROM public.companies c
WHERE c.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.accounts a WHERE a.company_id = c.id AND a.context = 'pj'
  );