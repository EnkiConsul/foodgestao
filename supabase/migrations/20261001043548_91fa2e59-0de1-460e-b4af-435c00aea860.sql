-- Rotina legada substituída por dp_admissao_regra_parentesco_definir_v2; sem chamada no app.
-- Reversão: GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_definir(uuid,text,boolean,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.dp_admissao_regra_parentesco_definir(uuid,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_admissao_regra_parentesco_definir(uuid,text,boolean,boolean) TO service_role;