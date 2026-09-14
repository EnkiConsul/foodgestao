REVOKE ALL ON FUNCTION public.dp_meu_acesso_portal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_meu_acesso_portal() FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_acesso_portal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_meu_acesso_portal() TO service_role;