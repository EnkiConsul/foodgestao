-- P0 Open Finance: pluggy_v2_sync_runs é registro interno de execução.
-- Cliente autenticado passa a ter APENAS leitura autorizada (empresa do vínculo);
-- escrita restrita ao service_role (worker/materializador).
-- Rollback: recriar policy ALL anterior (pv2_run_company_all) com o mesmo predicado.

DROP POLICY IF EXISTS pv2_run_company_all ON public.pluggy_v2_sync_runs;

CREATE POLICY pv2_run_company_select ON public.pluggy_v2_sync_runs
FOR SELECT TO authenticated
USING (
  public.auth_access_enabled()
  AND company_id IN (
    SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
    UNION
    SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
  )
);

REVOKE INSERT, UPDATE, DELETE ON public.pluggy_v2_sync_runs FROM authenticated;
GRANT SELECT ON public.pluggy_v2_sync_runs TO authenticated;
GRANT ALL ON public.pluggy_v2_sync_runs TO service_role;