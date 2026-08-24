CREATE OR REPLACE FUNCTION private.is_company_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id AND role = 'owner'
  ) OR public.has_role(_user_id, 'super_admin')
$$;

-- company_invites: admins cannot create/update invites granting owner role
DROP POLICY IF EXISTS "Admins can create invites" ON public.company_invites;
CREATE POLICY "Admins can create invites"
ON public.company_invites
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND invited_by = (SELECT auth.uid())
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
);

DROP POLICY IF EXISTS "Admins can update invites" ON public.company_invites;
CREATE POLICY "Admins can update invites"
ON public.company_invites
FOR UPDATE
TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
);

-- company_members: admins cannot grant or alter owner role
DROP POLICY IF EXISTS "Admins can add company members" ON public.company_members;
CREATE POLICY "Admins can add company members"
ON public.company_members
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
);

DROP POLICY IF EXISTS "Admins can update company members" ON public.company_members;
CREATE POLICY "Admins can update company members"
ON public.company_members
FOR UPDATE
TO authenticated
USING (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
)
WITH CHECK (
  private.is_company_admin_or_owner((SELECT auth.uid()), company_id)
  AND (role <> 'owner' OR private.is_company_owner((SELECT auth.uid()), company_id))
);