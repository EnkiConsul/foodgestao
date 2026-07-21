DROP POLICY IF EXISTS "public_can_create_cadastro" ON public.dp_cadastro_solicitacoes;
REVOKE INSERT ON public.dp_cadastro_solicitacoes FROM anon;

CREATE POLICY "authenticated_can_create_cadastro" ON public.dp_cadastro_solicitacoes
FOR INSERT TO authenticated
WITH CHECK (
  status = 'pendente'::dp_aprovacao_status
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = dp_cadastro_solicitacoes.company_id
      AND COALESCE(c.is_active, true) = true
  )
);