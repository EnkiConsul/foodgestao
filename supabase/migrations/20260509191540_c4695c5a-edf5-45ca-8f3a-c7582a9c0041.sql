GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_company_admin_or_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_company_ids(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_company_role(uuid, uuid) TO authenticated;