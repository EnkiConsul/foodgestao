REVOKE EXECUTE ON FUNCTION public.dp_indisponibilidade_marcar(date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_indisponibilidade_remover(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_capacidade_habitual_dia_cargo(uuid, uuid, uuid, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_folga_criar_admin(uuid, date, text, boolean, text, boolean) FROM anon;

REVOKE ALL ON FUNCTION public.dp_convocacao_estado_encerramento(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_folgas_validar_cobertura() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_estado_encerramento(timestamptz, timestamptz, timestamptz) TO service_role;