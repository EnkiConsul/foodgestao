-- As funções recriadas herdaram EXECUTE para 'anon' por privilégio padrão do
-- schema public. Fecha o acesso: anexo é só do servidor; conclusão exige login.
REVOKE ALL ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid, text, text, text, bigint)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_anexar_somente(uuid, uuid, uuid, text, text, text, bigint)
  TO service_role;

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar(uuid, uuid, uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text, numeric, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_preadmissao_efetivar_com_ficha(
  uuid, uuid, jsonb, text[], uuid, uuid, uuid, uuid, text, text, jsonb, text, numeric, date)
  TO authenticated, service_role;
