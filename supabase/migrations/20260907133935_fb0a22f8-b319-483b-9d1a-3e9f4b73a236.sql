REVOKE ALL ON FUNCTION public.dp_ocorrencia_cobertura_criar FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ocorrencia_cobertura_decidir FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_ocorrencia_cobertura_confirmar FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_notificar_admins_empresa FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_notificar_criador_ocorrencia FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_criar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_decidir TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ocorrencia_cobertura_confirmar TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_notificar_admins_empresa TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_notificar_criador_ocorrencia TO authenticated, service_role;