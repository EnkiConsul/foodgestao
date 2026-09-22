CREATE OR REPLACE FUNCTION private.is_company_admin_or_owner(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT private.is_company_admin_or_owner(auth.uid(), _company_id);
$$;

REVOKE ALL ON FUNCTION private.is_company_admin_or_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_company_admin_or_owner(uuid) TO authenticated, service_role;