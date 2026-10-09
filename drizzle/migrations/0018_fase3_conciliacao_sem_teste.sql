DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.billing_v2_reconciliation()'::regprocedure);
  d := replace(d, 'FUNCTION public.billing_v2_reconciliation()', 'FUNCTION public._billing_v2_reconciliation_bruta()');
  EXECUTE d;
END $do$;
REVOKE ALL ON FUNCTION public._billing_v2_reconciliation_bruta() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._billing_v2_reconciliation_bruta() TO service_role;

CREATE OR REPLACE FUNCTION public.billing_v2_reconciliation()
 RETURNS TABLE(tipo text, subscription_id uuid, company_id uuid, detalhe text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o super admin pode rodar a conciliação.';
  END IF;
  -- conciliação de produção: ignora empresas/assinaturas de contas de TESTE
  RETURN QUERY SELECT x.* FROM public._billing_v2_reconciliation_bruta() x
   WHERE NOT EXISTS (SELECT 1 FROM billing_account_companies b JOIN billing_accounts a ON a.id = b.billing_account_id
                      WHERE b.company_id = x.company_id AND b.removed_at IS NULL AND a.is_test)
     AND NOT EXISTS (SELECT 1 FROM subscriptions s JOIN billing_accounts a ON a.id = s.billing_account_id
                      WHERE s.id = x.subscription_id AND a.is_test);
END $$;