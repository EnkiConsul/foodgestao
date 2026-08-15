CREATE OR REPLACE FUNCTION public.get_accessible_accounts(_context context_type, _company_id uuid DEFAULT NULL::uuid, _include_inactive boolean DEFAULT false)
RETURNS SETOF accounts
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_accountant boolean := false;
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
    v_accountant := private.is_company_accountant(auth.uid(), _company_id);
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pj'
        AND a.company_id = _company_id
        AND (NOT v_accountant OR a.is_accounting)
      ORDER BY a.name;
  ELSE
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pf'
        AND a.user_id = auth.uid()
        AND a.company_id IS NULL
      ORDER BY a.name;
  END IF;
END;
$function$;