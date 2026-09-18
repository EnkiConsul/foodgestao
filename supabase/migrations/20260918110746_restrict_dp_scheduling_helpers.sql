-- Scheduling helpers are internal; browser callers use authorized group/offer RPCs.
-- Preserve SECURITY DEFINER bodies for nested execution by their existing owner.
REVOKE EXECUTE ON FUNCTION
  public.dp_ferias_periodo_conflitos(uuid, date, date),
  public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean),
  public.dp_convocacao_horario_efetivo(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.dp_ferias_periodo_conflitos(uuid, date, date),
  public.dp_convocacao_avaliar_candidato(uuid, uuid, uuid, boolean),
  public.dp_convocacao_horario_efetivo(uuid, uuid, jsonb)
TO service_role;
