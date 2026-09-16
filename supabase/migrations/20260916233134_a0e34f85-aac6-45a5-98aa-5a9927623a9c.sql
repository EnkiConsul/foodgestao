REVOKE ALL ON FUNCTION public.dp_preadmissao_guard() FROM public;
REVOKE ALL ON FUNCTION public.dp_preadmissao_guard() FROM anon;
REVOKE ALL ON FUNCTION public.dp_preadmissao_guard() FROM authenticated;
-- ROLLBACK: GRANT EXECUTE ON FUNCTION public.dp_preadmissao_guard() TO authenticated;