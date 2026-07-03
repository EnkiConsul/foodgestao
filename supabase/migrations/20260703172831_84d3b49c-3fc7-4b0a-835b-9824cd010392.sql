
REVOKE EXECUTE ON FUNCTION public.pluggy_link_provider_account(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_link_provider_account(uuid, uuid) TO authenticated, service_role;
