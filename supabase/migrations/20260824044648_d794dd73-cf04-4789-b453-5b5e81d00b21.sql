-- M14.1 — corretiva: os grants padrão do projeto concederam EXECUTE a anon
-- nas funções criadas na M14. Restringir conforme o desenho aprovado.

REVOKE ALL ON FUNCTION public.dp_conv_ocor_valida_alvo(text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_conv_ocor_valida_alvo(text, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.dp_conv_ocor_alvo_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_conv_ocor_alvo_guard() TO service_role;

REVOKE ALL ON FUNCTION public.dp_conv_grupo_modalidade_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_conv_grupo_modalidade_guard() TO service_role;

REVOKE ALL ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid, uuid, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid, timestamp with time zone, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.dp_convocacao_criar_ocorrencia(uuid, uuid, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_convocacao_atualizar_ocorrencia(uuid, timestamp with time zone, uuid, date, time without time zone, time without time zone, boolean, uuid, text, time without time zone, time without time zone, integer, boolean, numeric, integer, jsonb, uuid) TO authenticated, service_role;

-- ROLLBACK: GRANT EXECUTE ... TO anon (não recomendado).