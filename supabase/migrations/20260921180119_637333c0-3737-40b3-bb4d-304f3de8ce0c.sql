CREATE OR REPLACE FUNCTION private.category_linkable_by(_user_id uuid, _category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.categories c
    WHERE c.id = _category_id
      AND (c.context IS NULL OR c.context = 'pj'::context_type)
      AND (
        c.user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.category_companies cc
          WHERE cc.category_id = c.id
            AND private.can_edit_company_module(_user_id, cc.company_id, 'categories')
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION private.category_linkable_by(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.category_linkable_by(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS category_companies_insert_policy ON public.category_companies;
CREATE POLICY category_companies_insert_policy
ON public.category_companies
FOR INSERT
TO authenticated
WITH CHECK (
  private.can_edit_company_module((SELECT auth.uid()), company_id, 'categories')
  AND private.category_linkable_by((SELECT auth.uid()), category_id)
);