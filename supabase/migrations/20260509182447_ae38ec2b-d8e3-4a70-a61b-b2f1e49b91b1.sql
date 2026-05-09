
-- 1. Create private schema (not exposed via PostgREST)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres;

-- 2. Recreate company helpers inside private schema
CREATE OR REPLACE FUNCTION private.get_user_company_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION private.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id)
$$;

CREATE OR REPLACE FUNCTION private.get_company_role(_user_id uuid, _company_id uuid)
RETURNS company_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.is_company_admin_or_owner(_user_id uuid, _company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id AND role IN ('owner','admin'))
$$;

REVOKE ALL ON FUNCTION private.get_user_company_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_company_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_company_role(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_company_admin_or_owner(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Recreate all policies that reference the public versions, pointing to private.*

-- accounts
DROP POLICY IF EXISTS "Company admins can delete company accounts" ON public.accounts;
DROP POLICY IF EXISTS "Company admins can insert company accounts" ON public.accounts;
DROP POLICY IF EXISTS "Company admins can update company accounts" ON public.accounts;
DROP POLICY IF EXISTS "Company members can view company accounts" ON public.accounts;
CREATE POLICY "Company admins can delete company accounts" ON public.accounts FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company admins can insert company accounts" ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company admins can update company accounts" ON public.accounts FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company members can view company accounts" ON public.accounts FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id));

-- companies
DROP POLICY IF EXISTS "Company admins can update companies" ON public.companies;
DROP POLICY IF EXISTS "Company members can view companies" ON public.companies;
CREATE POLICY "Company admins can update companies" ON public.companies FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR private.is_company_admin_or_owner(auth.uid(), id))
  WITH CHECK (auth.uid() = user_id OR private.is_company_admin_or_owner(auth.uid(), id));
CREATE POLICY "Company members can view companies" ON public.companies FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR private.is_company_member(auth.uid(), id));

-- company_invites
DROP POLICY IF EXISTS "Admins can create invites" ON public.company_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.company_invites;
DROP POLICY IF EXISTS "Admins can update invites" ON public.company_invites;
DROP POLICY IF EXISTS "Admins can view company invites" ON public.company_invites;
CREATE POLICY "Admins can create invites" ON public.company_invites FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id) AND invited_by = auth.uid());
CREATE POLICY "Admins can delete invites" ON public.company_invites FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins can update invites" ON public.company_invites FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins can view company invites" ON public.company_invites FOR SELECT TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

-- company_members
DROP POLICY IF EXISTS "Admins can add company members" ON public.company_members;
DROP POLICY IF EXISTS "Admins can remove company members" ON public.company_members;
DROP POLICY IF EXISTS "Admins can update company members" ON public.company_members;
DROP POLICY IF EXISTS "Members can view company members" ON public.company_members;
CREATE POLICY "Admins can add company members" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins can remove company members" ON public.company_members FOR DELETE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Admins can update company members" ON public.company_members FOR UPDATE TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Members can view company members" ON public.company_members FOR SELECT TO authenticated
  USING (private.is_company_member(auth.uid(), company_id));

-- profiles
DROP POLICY IF EXISTS "Company members can view member profiles" ON public.profiles;
CREATE POLICY "Company members can view member profiles" ON public.profiles FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR user_id IN (
      SELECT cm.user_id FROM public.company_members cm
      WHERE cm.company_id IN (SELECT private.get_user_company_ids(auth.uid()))
    )
  );

-- transaction_attachments
DROP POLICY IF EXISTS "Company members can view company attachments" ON public.transaction_attachments;
CREATE POLICY "Company members can view company attachments" ON public.transaction_attachments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_attachments.transaction_id
      AND t.company_id IS NOT NULL
      AND private.is_company_member(auth.uid(), t.company_id)
  ));

-- transactions
DROP POLICY IF EXISTS "Company admins can delete company transactions" ON public.transactions;
DROP POLICY IF EXISTS "Company admins can insert company transactions" ON public.transactions;
DROP POLICY IF EXISTS "Company admins can update company transactions" ON public.transactions;
DROP POLICY IF EXISTS "Company members can view company transactions" ON public.transactions;
CREATE POLICY "Company admins can delete company transactions" ON public.transactions FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company admins can insert company transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company admins can update company transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (company_id IS NOT NULL AND private.is_company_admin_or_owner(auth.uid(), company_id));
CREATE POLICY "Company members can view company transactions" ON public.transactions FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND private.is_company_member(auth.uid(), company_id));

-- 4. Drop public versions
DROP FUNCTION public.get_user_company_ids(uuid);
DROP FUNCTION public.is_company_member(uuid, uuid);
DROP FUNCTION public.get_company_role(uuid, uuid);
DROP FUNCTION public.is_company_admin_or_owner(uuid, uuid);
