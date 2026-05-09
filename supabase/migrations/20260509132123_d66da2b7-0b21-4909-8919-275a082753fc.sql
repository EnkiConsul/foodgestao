
CREATE OR REPLACE FUNCTION public.get_balance_before(
  _user_id uuid,
  _context context_type,
  _company_id uuid,
  _before_date date
) RETURNS numeric
LANGUAGE sql
STABLE SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

-- Permissão de execução para usuários autenticados (RLS continua aplicada via SECURITY INVOKER)
REVOKE ALL ON FUNCTION public.get_balance_before(uuid, context_type, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_balance_before(uuid, context_type, uuid, date) TO authenticated;
