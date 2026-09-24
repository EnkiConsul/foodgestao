REVOKE ALL ON FUNCTION public.dp_setor_previsto(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_setor_previsto(uuid, date) TO service_role;