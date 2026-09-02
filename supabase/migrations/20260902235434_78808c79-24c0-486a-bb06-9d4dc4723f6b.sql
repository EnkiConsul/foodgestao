CREATE OR REPLACE FUNCTION public.get_accessible_categories(_context context_type, _company_id uuid DEFAULT NULL, _transaction_type transaction_type DEFAULT NULL)
RETURNS SETOF public.categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $func$
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
      WITH RECURSIVE direct_categories AS (
        SELECT c.*
        FROM public.categories c
        JOIN public.category_companies cc ON cc.category_id = c.id
        WHERE cc.company_id = _company_id
          AND c.is_active = true
          AND (c.context IS NULL OR c.context = 'pj')
          AND (_transaction_type IS NULL OR c.transaction_type = _transaction_type)
      ), category_tree AS (
        SELECT dc.*
        FROM direct_categories dc
        UNION
        SELECT parent.*
        FROM public.categories parent
        JOIN category_tree child ON child.parent_id = parent.id
        WHERE (parent.context IS NULL OR parent.context = 'pj')
      ), deduped AS (
        SELECT DISTINCT ON (ct.id) ct.*
        FROM category_tree ct
        ORDER BY ct.id
      )
      SELECT d.*
      FROM deduped d
      ORDER BY d.transaction_type, d.sort_order, d.name;
  ELSE
    RETURN QUERY
      SELECT c.*
      FROM public.categories c
      WHERE c.user_id = auth.uid()
        AND c.is_active = true
        AND (c.context IS NULL OR c.context = 'pf')
        AND c.visible_pf = true
        AND (_transaction_type IS NULL OR c.transaction_type = _transaction_type)
      ORDER BY c.transaction_type, c.sort_order, c.name;
  END IF;
END;
$func$;