REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_criar FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_decidir FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_confirmar FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_notificar_admins_empresa FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_notificar_criador_ocorrencia FROM anon;

REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_criar FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_decidir FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_confirmar FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_notificar_admins_empresa FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_notificar_criador_ocorrencia FROM PUBLIC;