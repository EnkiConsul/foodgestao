REVOKE ALL ON FUNCTION public.dp_sindicato_conflitos(uuid, uuid, public.dp_sindicato_tipo, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_sindicato_conflitos(uuid, uuid, public.dp_sindicato_tipo, uuid) TO service_role;
