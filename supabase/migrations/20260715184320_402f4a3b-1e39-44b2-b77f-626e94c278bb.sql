REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding(
  text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[]
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding(
  text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[]
) FROM anon;

GRANT EXECUTE ON FUNCTION public.fn_cadastrar_empresa_onboarding(
  text,text,text,text,text,text,text,uuid,text,text,text,text,text,text,text,text,text,text,text[]
) TO authenticated;