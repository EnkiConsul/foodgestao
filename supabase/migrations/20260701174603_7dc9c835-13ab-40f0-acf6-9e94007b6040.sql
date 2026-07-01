CREATE OR REPLACE FUNCTION public.get_accessible_payment_methods(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _include_inactive boolean DEFAULT false
)
RETURNS SETOF public.payment_methods
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
      SELECT pm.* FROM public.payment_methods pm
      JOIN public.payment_method_companies pmc ON pmc.payment_method_id = pm.id
      WHERE (_include_inactive OR pm.is_active = true)
        AND pm.user_id = auth.uid()
        AND pmc.company_id = _company_id
      ORDER BY pm.name;
  ELSE
    RETURN QUERY
      SELECT pm.* FROM public.payment_methods pm
      WHERE (_include_inactive OR pm.is_active = true)
        AND pm.user_id = auth.uid()
        AND pm.visible_pf = true
      ORDER BY pm.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_payment_methods(context_type, uuid, boolean) TO authenticated;