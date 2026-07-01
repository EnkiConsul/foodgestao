
CREATE OR REPLACE FUNCTION public.get_accessible_accounts(_context context_type, _company_id uuid DEFAULT NULL)
RETURNS SETOF public.accounts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN
      RETURN;
    END IF;
    IF NOT private.is_company_member(auth.uid(), _company_id) THEN
      RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE a.is_active = true
        AND a.context = 'pj'
        AND a.company_id = _company_id
      ORDER BY a.name;
  ELSE
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE a.is_active = true
        AND a.context = 'pf'
        AND a.user_id = auth.uid()
        AND a.company_id IS NULL
      ORDER BY a.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_accounts(context_type, uuid) TO authenticated;
