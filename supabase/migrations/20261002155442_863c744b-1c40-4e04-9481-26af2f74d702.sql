DROP FUNCTION IF EXISTS public.dp_meu_vinculo();
CREATE FUNCTION public.dp_meu_vinculo()
RETURNS TABLE (
  colaborador_id uuid,
  company_id uuid,
  unidade_id uuid,
  unidade_nome text,
  unidade_usa_ponto boolean,
  nome text,
  regime text,
  forma_pagamento text,
  ativo boolean,
  acesso_portal_ate date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id,
         c.company_id,
         c.unidade_id,
         u.nome::text,
         COALESCE(u.possui_relogio_ponto, false),
         c.nome::text,
         c.regime::text,
         c.forma_pagamento::text,
         c.ativo,
         c.acesso_portal_ate
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = public.dp_meu_colaborador();
$$;

REVOKE ALL ON FUNCTION public.dp_meu_vinculo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_meu_vinculo() FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_vinculo() TO authenticated, service_role;