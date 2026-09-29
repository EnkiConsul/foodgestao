CREATE OR REPLACE FUNCTION public.assinatura_pode_gerir(_company_id uuid, _nivel text DEFAULT 'consulta')
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _company_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.companies c
          WHERE c.id = _company_id AND c.user_id = auth.uid()
       )
       OR public.tem_permissao(_company_id, 'conta.assinatura', _nivel)
     )
$$;

REVOKE ALL ON FUNCTION public.assinatura_pode_gerir(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assinatura_pode_gerir(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.assinatura_pode_gerir(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assinatura_pode_gerir(uuid, text) TO service_role;

DROP POLICY IF EXISTS "Membros autorizados veem assinatura da empresa" ON public.subscriptions;
CREATE POLICY "Membros autorizados veem assinatura da empresa"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.assinatura_pode_gerir(company_id, 'consulta'));

DROP POLICY IF EXISTS "Membros autorizados veem faturas da empresa" ON public.invoices;
CREATE POLICY "Membros autorizados veem faturas da empresa"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.id = invoices.subscription_id
       AND public.assinatura_pode_gerir(s.company_id, 'consulta')
  )
);