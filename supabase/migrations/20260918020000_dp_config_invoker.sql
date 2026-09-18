-- Resolve direct RPC reads through the caller's existing dp_config_dp RLS policies.
-- Trusted SECURITY DEFINER callers retain their own execution context.
-- dp_ferias_config intentionally keeps public fallback defaults when no row is visible.
ALTER FUNCTION public.dp_config_resolvida(uuid, uuid) SECURITY INVOKER;
ALTER FUNCTION public.dp_ferias_config(uuid, uuid) SECURITY INVOKER;
REVOKE EXECUTE ON FUNCTION public.dp_config_resolvida(uuid, uuid),
  public.dp_ferias_config(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_config_resolvida(uuid, uuid),
  public.dp_ferias_config(uuid, uuid) TO authenticated, service_role;
