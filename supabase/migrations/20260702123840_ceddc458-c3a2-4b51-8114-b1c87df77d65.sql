CREATE OR REPLACE FUNCTION public.get_accessible_categories(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _transaction_type transaction_type DEFAULT NULL
)
RETURNS SETOF public.categories
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
      SELECT c.*
      FROM public.categories c
      JOIN public.category_companies cc ON cc.category_id = c.id
      WHERE c.user_id = auth.uid()
        AND (c.context IS NULL OR c.context = 'pj')
        AND cc.company_id = _company_id
        AND (_transaction_type IS NULL OR c.transaction_type = _transaction_type)
      ORDER BY c.transaction_type, c.sort_order, c.name;
  ELSE
    RETURN QUERY
      SELECT c.*
      FROM public.categories c
      WHERE c.user_id = auth.uid()
        AND (c.context IS NULL OR c.context = 'pf')
        AND c.visible_pf = true
        AND (_transaction_type IS NULL OR c.transaction_type = _transaction_type)
      ORDER BY c.transaction_type, c.sort_order, c.name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_categories(context_type, uuid, transaction_type) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_accessible_categories(context_type, uuid, transaction_type) FROM anon, public;