-- These are server-side helpers, not browser RPC endpoints.
-- Admission Edge Functions use serviceClient(); remuneration is called by
-- existing postgres-owned SECURITY DEFINER entry points.
-- Keep bodies unchanged so rule specificity and remuneration arithmetic remain identical.
REVOKE EXECUTE ON FUNCTION
  public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho),
  public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho, text),
  public.dp_convocacao_remuneracao_snapshot(uuid, numeric)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho),
  public.dp_admissao_regras_resolver(uuid, uuid, uuid, public.dp_regime_trabalho, text),
  public.dp_convocacao_remuneracao_snapshot(uuid, numeric)
TO service_role;
