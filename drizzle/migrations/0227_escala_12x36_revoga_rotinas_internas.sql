REVOKE ALL ON FUNCTION private.dp_12x36_paridade(date, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_12x36_plantao_em(uuid, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_12x36_trabalha_apos_troca(uuid, date, date, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_12x36_consecutivos(uuid, uuid, date, date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_config_trabalho_herdar_12x36() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_config_dias_12x36() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_trocas_12x36_guard() FROM anon, authenticated;
