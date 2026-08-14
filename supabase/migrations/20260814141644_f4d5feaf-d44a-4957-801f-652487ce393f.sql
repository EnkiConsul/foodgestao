REVOKE ALL ON FUNCTION public.dp_folha_pendencias_remuneracao(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dp_folha_pendencias_remuneracao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_folha_pendencias_remuneracao(uuid) TO service_role;