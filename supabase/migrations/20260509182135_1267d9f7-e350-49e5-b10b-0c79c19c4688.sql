
-- Harden SECURITY DEFINER functions: revoke broad EXECUTE, grant only what's needed.

-- Trigger-only functions: revoke from everyone (triggers run as table owner)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_add_company_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- RLS helper functions: only authenticated needs EXECUTE (used inside policies)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_company_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_company_ids(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.get_company_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_company_role(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_company_admin_or_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_company_admin_or_owner(uuid, uuid) TO authenticated;

-- Client RPC: only authenticated
REVOKE ALL ON FUNCTION public.insert_audit_log(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, jsonb) TO authenticated;

-- Non-SECURITY DEFINER but client-called: scope to authenticated as well
REVOKE ALL ON FUNCTION public.get_balance_before(uuid, context_type, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_balance_before(uuid, context_type, uuid, date) TO authenticated;
