CREATE OR REPLACE FUNCTION private.category_visible_to_member(_uid uuid, _category_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.category_companies cc
    JOIN public.company_members m
      ON m.company_id = cc.company_id
     AND m.user_id = _uid
    WHERE cc.category_id = _category_id
  );
$$;

CREATE OR REPLACE FUNCTION private.contact_visible_to_member(_uid uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contact_companies cc
    JOIN public.company_members m
      ON m.company_id = cc.company_id
     AND m.user_id = _uid
    WHERE cc.contact_id = _contact_id
  );
$$;