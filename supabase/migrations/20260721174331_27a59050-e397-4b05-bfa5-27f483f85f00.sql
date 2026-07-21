-- Restringe INSERT em dp_cadastro_solicitacoes: exige membership da empresa alvo,
-- evitando que qualquer usuário autenticado submeta PII para tenants arbitrários.
DROP POLICY IF EXISTS authenticated_can_create_cadastro ON public.dp_cadastro_solicitacoes;

CREATE POLICY members_can_create_cadastro
ON public.dp_cadastro_solicitacoes
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pendente'::dp_aprovacao_status
  AND private.is_company_member(auth.uid(), company_id)
);