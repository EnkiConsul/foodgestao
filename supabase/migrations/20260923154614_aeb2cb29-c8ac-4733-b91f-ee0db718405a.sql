CREATE OR REPLACE FUNCTION public.get_balance_before(_user_id uuid, _context context_type, _company_id uuid, _before_date date)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    CASE
      WHEN transaction_type = 'entrada' THEN amount
      WHEN transaction_type = 'saida' THEN -amount
      ELSE 0
    END
  ), 0)::numeric
  FROM public.transactions
  WHERE context = _context
    AND status = 'confirmado'
    AND transaction_date < _before_date
    AND (
      CASE
        WHEN _context = 'pj' THEN company_id = _company_id
        ELSE user_id = _user_id AND company_id IS NULL
      END
    );
$function$;