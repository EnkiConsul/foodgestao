
-- Relax validation trigger: no longer requires parcel_direction; validates only installment_number/total consistency for any type
CREATE OR REPLACE FUNCTION public.validate_installment_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.installment_total IS NOT NULL THEN
    IF NEW.installment_total < 2 THEN
      RAISE EXCEPTION 'installment_total deve ser >= 2' USING ERRCODE = '22023';
    END IF;
    IF NEW.installment_number IS NOT NULL AND (NEW.installment_number < 1 OR NEW.installment_number > NEW.installment_total) THEN
      RAISE EXCEPTION 'installment_number fora do intervalo (1..installment_total)' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Revert balance functions to type-based logic (parcelas usam receita/despesa direto)
CREATE OR REPLACE FUNCTION public.recompute_account_balance(_account_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _acc public.accounts;
  _movements numeric;
  _new_balance numeric;
BEGIN
  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id;
  IF _acc IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _acc.user_id <> auth.uid()
     AND NOT public.is_super_admin(auth.uid())
     AND NOT (
       _acc.context = 'pj' AND _acc.company_id IS NOT NULL
       AND private.is_company_member(auth.uid(), _acc.company_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type = 'receita'      AND t.account_id = _account_id THEN t.amount
      WHEN t.transaction_type = 'despesa'      AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = _account_id THEN t.amount
      ELSE 0
    END
  ), 0)
  INTO _movements
  FROM public.transactions t
  WHERE t.status = 'confirmado'
    AND (t.account_id = _account_id OR t.destination_account_id = _account_id);

  _new_balance := COALESCE(_acc.initial_balance, 0) + _movements;

  UPDATE public.accounts
     SET current_balance = _new_balance
   WHERE id = _account_id;

  RETURN _new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_balance_before(_user_id uuid, _context context_type, _company_id uuid, _before_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'receita' THEN amount
      WHEN transaction_type = 'despesa' THEN -amount
      ELSE 0
    END
  ), 0)::numeric
  FROM public.transactions
  WHERE user_id = _user_id
    AND context = _context
    AND status = 'confirmado'
    AND transaction_date < _before_date
    AND (_company_id IS NULL OR company_id = _company_id);
$function$;

CREATE OR REPLACE FUNCTION public.plin_ia_summary(_context context_type, _company_id uuid DEFAULT NULL::uuid, _from date DEFAULT NULL::date, _to date DEFAULT NULL::date)
 RETURNS TABLE(total_receitas numeric, total_despesas numeric, saldo_liquido numeric, pendentes integer, vencidos integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      COALESCE(SUM(CASE
        WHEN transaction_type='receita' THEN amount
        WHEN transaction_type='despesa' THEN -amount
        ELSE 0
      END),0)::numeric,
      COUNT(*) FILTER (WHERE status IN ('pendente'))::int,
      COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE AND status = 'pendente')::int
    FROM public.transactions
    WHERE user_id = _uid
      AND context = _context
      AND (_context = 'pf' AND company_id IS NULL OR _context='pj' AND company_id = _company_id)
      AND status <> 'cancelado'
      AND transaction_date BETWEEN _f AND _t;
END $function$;

CREATE OR REPLACE FUNCTION public.plin_ia_cashflow(_context context_type, _company_id uuid DEFAULT NULL::uuid, _months integer DEFAULT 6)
 RETURNS TABLE(mes text, receitas numeric, despesas numeric, saldo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           COALESCE(SUM(CASE WHEN t.transaction_type='receita' THEN t.amount END),0)::numeric,
           COALESCE(SUM(CASE WHEN t.transaction_type='despesa' THEN t.amount END),0)::numeric,
           COALESCE(SUM(CASE
             WHEN t.transaction_type='receita' THEN t.amount
             WHEN t.transaction_type='despesa' THEN -t.amount
             ELSE 0
           END),0)::numeric
    FROM public.transactions t
    WHERE t.user_id = _uid
      AND t.context = _context
      AND (_context='pf' AND t.company_id IS NULL OR _context='pj' AND t.company_id = _company_id)
      AND t.status <> 'cancelado'
      AND t.transaction_date >= _start
    GROUP BY 1
    ORDER BY 1;
END $function$;
