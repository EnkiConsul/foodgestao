CREATE OR REPLACE FUNCTION public.pluggy_user_can_edit(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    private.is_company_owner(_user_id, _company_id)
    OR private.member_can_edit(_user_id, _company_id, 'transactions'),
    false
  )
$$;

REVOKE ALL ON FUNCTION public.pluggy_user_can_edit(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pluggy_user_can_edit(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.pluggy_user_can_edit(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_user_can_edit(uuid, uuid) TO service_role;