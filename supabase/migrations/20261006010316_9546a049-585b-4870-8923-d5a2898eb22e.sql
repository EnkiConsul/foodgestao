REVOKE EXECUTE ON FUNCTION public.dp_ferias_solicitacao_assinar(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ferias_registrar_ciencia(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ferias_aprovar_ajustado(uuid, date, date, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ferias_termo_obter(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ferias_gozo_reset_ciencia() FROM anon, authenticated;