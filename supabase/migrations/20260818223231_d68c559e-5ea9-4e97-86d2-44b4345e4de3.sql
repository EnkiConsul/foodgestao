REVOKE ALL ON FUNCTION public.dp_documento_requisitos_seed_on_company() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_documento_requisitos_seed_on_company() TO service_role;
REVOKE ALL ON FUNCTION public.dp_documento_requisitos_seed(uuid) FROM PUBLIC, anon;