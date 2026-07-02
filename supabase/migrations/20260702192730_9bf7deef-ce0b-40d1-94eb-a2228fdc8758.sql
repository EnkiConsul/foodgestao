-- Plin IA: RPCs para consulta sob demanda do banco de dados

-- Helper: aplica filtro de escopo (context/company) via auth.uid()
-- Todas as funções abaixo são SECURITY DEFINER mas usam auth.uid() para escopo

CREATE OR REPLACE FUNCTION public.plin_ia_summary(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL
) RETURNS TABLE(
  total_receitas numeric,
  total_despesas numeric,
  saldo_liquido numeric,
  pendentes int,
  vencidos int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f date := COALESCE(_from, date_trunc('month', CURRENT_DATE)::date);
  _t date := COALESCE(_to, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type='receita' THEN amount END),0)::numeric,
      COALESCE(SUM(CASE WHEN transaction_type='despesa' THEN amount END),0)::numeric,
      COALESCE(SUM(CASE WHEN transaction_type='receita' THEN amount
                        WHEN transaction_type='despesa' THEN -amount ELSE 0 END),0)::numeric,
      COUNT(*) FILTER (WHERE status IN ('pendente'))::int,
      COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status = 'pendente')::int
    FROM public.transactions
    WHERE user_id = _uid
      AND context = _context
      AND (_context = 'pf' AND company_id IS NULL OR _context='pj' AND company_id = _company_id)
      AND status <> 'cancelado'
      AND transaction_date BETWEEN _f AND _t;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_by_account(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _type transaction_type DEFAULT NULL
) RETURNS TABLE(account_id uuid, account_name text, total numeric, qtd int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f date := COALESCE(_from, date_trunc('month', CURRENT_DATE)::date);
  _t date := COALESCE(_to, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT a.id, a.name, COALESCE(SUM(t.amount),0)::numeric, COUNT(t.id)::int
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context = 'pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status <> 'cancelado'
      AND t.transaction_date BETWEEN _f AND _t
      AND (_type IS NULL OR t.transaction_type = _type)
    GROUP BY a.id, a.name
    ORDER BY SUM(t.amount) DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_by_category(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _type transaction_type DEFAULT NULL
) RETURNS TABLE(category_id uuid, category_name text, total numeric, qtd int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f date := COALESCE(_from, date_trunc('month', CURRENT_DATE)::date);
  _t date := COALESCE(_to, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT c.id, COALESCE(c.name, 'Sem categoria'), COALESCE(SUM(t.amount),0)::numeric, COUNT(t.id)::int
    FROM public.transactions t
    LEFT JOIN public.categories c ON c.id = t.category_id
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context = 'pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status <> 'cancelado'
      AND t.transaction_date BETWEEN _f AND _t
      AND (_type IS NULL OR t.transaction_type = _type)
    GROUP BY c.id, c.name
    ORDER BY SUM(t.amount) DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_by_contact(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _type transaction_type DEFAULT NULL
) RETURNS TABLE(contact_id uuid, contact_name text, total numeric, qtd int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _f date := COALESCE(_from, date_trunc('month', CURRENT_DATE)::date);
  _t date := COALESCE(_to, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT co.id, COALESCE(co.name, 'Sem contato'), COALESCE(SUM(t.amount),0)::numeric, COUNT(t.id)::int
    FROM public.transactions t
    LEFT JOIN public.contacts co ON co.id = t.contact_id
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context = 'pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status <> 'cancelado'
      AND t.transaction_date BETWEEN _f AND _t
      AND (_type IS NULL OR t.transaction_type = _type)
    GROUP BY co.id, co.name
    ORDER BY SUM(t.amount) DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_upcoming(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _days int DEFAULT 7
) RETURNS TABLE(id uuid, description text, amount numeric, amount_paid numeric, due_date date, transaction_type transaction_type, status transaction_status)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT t.id, t.description, t.amount, t.amount_paid, t.due_date, t.transaction_type, t.status
    FROM public.transactions t
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context='pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status = 'pendente'
      AND t.due_date IS NOT NULL
      AND t.due_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + (_days || ' days')::interval)::date
    ORDER BY t.due_date ASC
    LIMIT 50;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_overdue(
  _context context_type,
  _company_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, description text, amount numeric, amount_paid numeric, due_date date, transaction_type transaction_type, dias_atraso int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT t.id, t.description, t.amount, t.amount_paid, t.due_date, t.transaction_type,
           (CURRENT_DATE - t.due_date)::int
    FROM public.transactions t
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context='pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status = 'pendente'
      AND t.due_date IS NOT NULL
      AND t.due_date < CURRENT_DATE
    ORDER BY t.due_date ASC
    LIMIT 100;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_search_transactions(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _type transaction_type DEFAULT NULL,
  _status transaction_status DEFAULT NULL,
  _account_id uuid DEFAULT NULL,
  _category_id uuid DEFAULT NULL,
  _contact_id uuid DEFAULT NULL,
  _min numeric DEFAULT NULL,
  _max numeric DEFAULT NULL,
  _query text DEFAULT NULL,
  _limit int DEFAULT 20
) RETURNS TABLE(
  id uuid, description text, amount numeric, amount_paid numeric,
  transaction_date date, due_date date, payment_date date,
  transaction_type transaction_type, status transaction_status,
  account_name text, category_name text, contact_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT t.id, t.description, t.amount, t.amount_paid,
           t.transaction_date, t.due_date, t.payment_date,
           t.transaction_type, t.status,
           a.name, c.name, co.name
    FROM public.transactions t
    LEFT JOIN public.accounts a ON a.id = t.account_id
    LEFT JOIN public.categories c ON c.id = t.category_id
    LEFT JOIN public.contacts co ON co.id = t.contact_id
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context='pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND (_from IS NULL OR t.transaction_date >= _from)
      AND (_to   IS NULL OR t.transaction_date <= _to)
      AND (_type IS NULL OR t.transaction_type = _type)
      AND (_status IS NULL OR t.status = _status)
      AND (_account_id IS NULL OR t.account_id = _account_id)
      AND (_category_id IS NULL OR t.category_id = _category_id)
      AND (_contact_id IS NULL OR t.contact_id = _contact_id)
      AND (_min IS NULL OR t.amount >= _min)
      AND (_max IS NULL OR t.amount <= _max)
      AND (_query IS NULL OR t.description ILIKE '%' || _query || '%')
    ORDER BY t.transaction_date DESC
    LIMIT LEAST(COALESCE(_limit, 20), 50);
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_cashflow(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _months int DEFAULT 6
) RETURNS TABLE(mes text, receitas numeric, despesas numeric, saldo numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _start date := (date_trunc('month', CURRENT_DATE) - ((GREATEST(_months,1)-1) || ' months')::interval)::date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT to_char(date_trunc('month', t.transaction_date), 'YYYY-MM') AS mes,
           COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type='receita'),0)::numeric,
           COALESCE(SUM(t.amount) FILTER (WHERE t.transaction_type='despesa'),0)::numeric,
           COALESCE(SUM(CASE WHEN t.transaction_type='receita' THEN t.amount
                             WHEN t.transaction_type='despesa' THEN -t.amount ELSE 0 END),0)::numeric
    FROM public.transactions t
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context='pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status <> 'cancelado'
      AND t.transaction_date >= _start
    GROUP BY 1
    ORDER BY 1;
END $$;

CREATE OR REPLACE FUNCTION public.plin_ia_accounts_balance(
  _context context_type,
  _company_id uuid DEFAULT NULL
) RETURNS TABLE(account_id uuid, account_name text, current_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
    SELECT a.id, a.name, a.current_balance
    FROM public.accounts a
    WHERE a.user_id = _uid
      AND a.is_active = true
      AND a.context = _context
      AND (_context='pf' AND a.company_id IS NULL OR _context='pj' AND a.company_id = _company_id)
    ORDER BY a.name;
END $$;

GRANT EXECUTE ON FUNCTION public.plin_ia_summary(context_type, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_account(context_type, uuid, date, date, transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_category(context_type, uuid, date, date, transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_by_contact(context_type, uuid, date, date, transaction_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_upcoming(context_type, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_overdue(context_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_search_transactions(context_type, uuid, date, date, transaction_type, transaction_status, uuid, uuid, uuid, numeric, numeric, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_cashflow(context_type, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plin_ia_accounts_balance(context_type, uuid) TO authenticated;