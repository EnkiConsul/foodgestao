
-- Fix dp_ponto_fechamentos: qualify functions with private./public. schema
DROP POLICY IF EXISTS dp_ponto_fechamentos_admin_all ON public.dp_ponto_fechamentos;
DROP POLICY IF EXISTS dp_ponto_fechamentos_colab_select ON public.dp_ponto_fechamentos;

CREATE POLICY dp_ponto_fechamentos_admin_all
ON public.dp_ponto_fechamentos
FOR ALL
TO authenticated
USING (private.is_company_admin_or_owner(auth.uid(), company_id))
WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY dp_ponto_fechamentos_colab_select
ON public.dp_ponto_fechamentos
FOR SELECT
TO authenticated
USING (colaborador_id = public.dp_colaborador_of(auth.uid()));

-- Fix auth_recovery_challenges: add explicit restrictive deny for anon/authenticated
-- so intent (service_role only) is auditable via policy inspection.
CREATE POLICY auth_recovery_challenges_deny_clients
ON public.auth_recovery_challenges
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

COMMENT ON TABLE public.auth_recovery_challenges IS
'Password recovery challenges. Fail-closed for anon/authenticated via restrictive policy; accessed exclusively by edge functions using service_role.';
