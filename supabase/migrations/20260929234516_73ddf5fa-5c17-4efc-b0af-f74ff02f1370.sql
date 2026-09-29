REVOKE ALL ON FUNCTION public.dp_ferias_meus_pedidos() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_ferias_pedido_editar(uuid, date, date, integer, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_ferias_remarcacao_solicitar(uuid, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_folga_ferias_no_mes(uuid, uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dp_ferias_meus_pedidos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ferias_pedido_editar(uuid, date, date, integer, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_ferias_remarcacao_solicitar(uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_folga_ferias_no_mes(uuid, uuid, date) TO authenticated, service_role;
