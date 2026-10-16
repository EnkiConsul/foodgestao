REVOKE EXECUTE ON FUNCTION public.access_model_mode() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.dp_trocas_afastamentos(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.access_model_mode() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_trocas_afastamentos(date, date) TO authenticated, service_role;