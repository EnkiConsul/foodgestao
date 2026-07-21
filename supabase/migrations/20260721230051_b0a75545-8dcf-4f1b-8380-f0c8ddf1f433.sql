CREATE OR REPLACE FUNCTION public.resolve_cpf_login(_cpf text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email_portal
  FROM public.dp_colaboradores
  WHERE regexp_replace(coalesce(cpf,''), '\D', '', 'g')
      = regexp_replace(coalesce(_cpf,''), '\D', '', 'g')
    AND user_id IS NOT NULL
    AND email_portal IS NOT NULL
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_cpf_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_cpf_login(text) TO anon, authenticated;