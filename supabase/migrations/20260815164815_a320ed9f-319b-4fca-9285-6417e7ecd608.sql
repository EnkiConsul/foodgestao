ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_accounting boolean NOT NULL DEFAULT true;

UPDATE public.accounts
SET is_accounting = false
WHERE lower(translate(name, 'áàâãéêíóôõúüç', 'aaaaeeiooouuc')) ~ '(nao contabil|emprestimos? (efetuados|tomados))';

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
    initial_balance, current_balance, is_active, is_accounting
  )
  SELECT NEW.user_id, NEW.id, v.name, v.acc_type::public.account_type, 'pj'::public.context_type, 0, 0, true, v.is_accounting
  FROM (VALUES
    ('Dinheiro', 'dinheiro', true),
    ('Caixa Contábil', 'dinheiro', true),
    ('Caixa não Contábil', 'dinheiro', false),
    ('Empréstimos Efetuados (Ativo)', 'outro', false),
    ('Empréstimos Tomados (Passivo)', 'outro', false)
  ) AS v(name, acc_type, is_accounting);

  RETURN NEW;
END;
$$;