
CREATE OR REPLACE FUNCTION private.member_permission(
  _user_id uuid,
  _company_id uuid,
  _module text
) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT CASE
    WHEN cm.role IN ('owner','admin') THEN 'edit'
    WHEN cm.role = 'viewer' THEN 'view'
    WHEN cm.role = 'member' THEN COALESCE(cm.permissions->>_module, 'edit')
    ELSE 'none'
  END
  FROM public.company_members cm
  WHERE cm.user_id = _user_id AND cm.company_id = _company_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.member_can_edit(
  _user_id uuid,
  _company_id uuid,
  _module text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT COALESCE(private.member_permission(_user_id, _company_id, _module) = 'edit', false);
$$;

REVOKE EXECUTE ON FUNCTION private.member_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.member_can_edit(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Company admins can insert company transactions" ON public.transactions;
DROP POLICY IF EXISTS "Company admins can update company transactions" ON public.transactions;
DROP POLICY IF EXISTS "Company admins can delete company transactions" ON public.transactions;

CREATE POLICY "Company editors can insert company transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'));

CREATE POLICY "Company editors can update company transactions" ON public.transactions
  FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'))
  WITH CHECK (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'));

CREATE POLICY "Company editors can delete company transactions" ON public.transactions
  FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'transactions'));

DROP POLICY IF EXISTS "Company admins can insert company accounts" ON public.accounts;
DROP POLICY IF EXISTS "Company admins can update company accounts" ON public.accounts;
DROP POLICY IF EXISTS "Company admins can delete company accounts" ON public.accounts;

CREATE POLICY "Company editors can insert company accounts" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'accounts'));

CREATE POLICY "Company editors can update company accounts" ON public.accounts
  FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'accounts'))
  WITH CHECK (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'accounts'));

CREATE POLICY "Company editors can delete company accounts" ON public.accounts
  FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND private.member_can_edit(auth.uid(), company_id, 'accounts'));
