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
  )
  SELECT NEW.user_id, NEW.id, v.name, v.acc_type::public.account_type, 'pj'::public.context_type, 0, 0, true
  FROM (VALUES
    ('Dinheiro', 'dinheiro'),
    ('Caixa Contábil', 'dinheiro'),
    ('Caixa não Contábil', 'dinheiro'),
    ('Empréstimos Efetuados (Ativo)', 'outro'),
    ('Empréstimos Tomados (Passivo)', 'outro')
  ) AS v(name, acc_type);

  RETURN NEW;
END;
$$;