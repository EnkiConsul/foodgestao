
-- These helpers query company_members, whose RLS policies themselves call them.
-- SECURITY INVOKER causes infinite recursion. Restore SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.get_user_company_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.company_members WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id)
$$;

CREATE OR REPLACE FUNCTION public.get_company_role(_user_id uuid, _company_id uuid)
RETURNS company_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_company_admin_or_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id AND role IN ('owner','admin'))
$$;

REVOKE ALL ON FUNCTION public.get_user_company_ids(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_company_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_admin_or_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_admin_or_owner(uuid, uuid) TO authenticated;
