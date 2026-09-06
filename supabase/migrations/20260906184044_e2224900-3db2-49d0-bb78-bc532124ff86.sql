DROP FUNCTION IF EXISTS public.dp_convocacao_responder_oferta(uuid, boolean, text);

REVOKE ALL ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text, time without time zone, time without time zone, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_avaliar_parcial(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_parciais_pendentes(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_convocacao_decidir_parcial(uuid, text, text, timestamptz, uuid[], boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_responder_oferta(uuid, boolean, text, time without time zone, time without time zone, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_avaliar_parcial(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_parciais_pendentes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_decidir_parcial(uuid, text, text, timestamptz, uuid[], boolean) TO authenticated;