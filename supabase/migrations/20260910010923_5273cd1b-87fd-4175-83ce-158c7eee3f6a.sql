REVOKE ALL ON FUNCTION public.dp_guard_transicao_regime() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_regime_formalizado(public.dp_regime_trabalho) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_regime_formalizado(public.dp_regime_trabalho) TO service_role;