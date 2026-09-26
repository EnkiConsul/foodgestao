REVOKE ALL ON FUNCTION public.subscription_addon_set_prorata() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_guard_limite_colaborador() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_guard_limite_unidade() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assinatura_limite_excedido(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_addon_set_prorata() TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_guard_limite_colaborador() TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_guard_limite_unidade() TO service_role;