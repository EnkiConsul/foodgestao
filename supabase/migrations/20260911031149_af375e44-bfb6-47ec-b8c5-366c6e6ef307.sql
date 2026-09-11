REVOKE EXECUTE ON FUNCTION public.dp_refresh_my_company_pending(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.dp_refresh_my_company_pending(uuid) TO service_role;