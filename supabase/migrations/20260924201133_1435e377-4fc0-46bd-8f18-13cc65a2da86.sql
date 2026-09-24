REVOKE ALL ON FUNCTION public.minhas_unidades_permitidas(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unidade_liberada(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.minhas_unidades_permitidas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unidade_liberada(uuid, uuid) TO authenticated, service_role;