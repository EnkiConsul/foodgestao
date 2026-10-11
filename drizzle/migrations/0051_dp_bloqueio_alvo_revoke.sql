REVOKE ALL ON FUNCTION private.dp_regra_casa_data(text,int,int,jsonb,date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regra_vale_unidade(uuid,uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_regra_bloqueia_colaborador(uuid,date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_colab_tem_restricao_mes(uuid,date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.dp_folga_data_bloqueada_colab(uuid,date) FROM anon, authenticated;