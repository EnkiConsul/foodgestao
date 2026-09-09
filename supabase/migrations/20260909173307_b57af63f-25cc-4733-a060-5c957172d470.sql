REVOKE ALL ON FUNCTION public.company_access_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.company_access_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.company_access_status(uuid) TO authenticated;