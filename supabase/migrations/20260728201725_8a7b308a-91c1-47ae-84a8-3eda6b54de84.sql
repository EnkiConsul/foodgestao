-- 1) auth_user_security_state: block all client-side writes (service_role only)
DROP POLICY IF EXISTS "No client writes to security state" ON public.auth_user_security_state;
CREATE POLICY "No client writes to security state"
  ON public.auth_user_security_state
  AS RESTRICTIVE
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client updates to security state" ON public.auth_user_security_state;
CREATE POLICY "No client updates to security state"
  ON public.auth_user_security_state
  AS RESTRICTIVE
  FOR UPDATE TO authenticated, anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No client deletes of security state" ON public.auth_user_security_state;
CREATE POLICY "No client deletes of security state"
  ON public.auth_user_security_state
  AS RESTRICTIVE
  FOR DELETE TO authenticated, anon
  USING (false);

-- 2) dp_bloqueio_regras / dp_bloqueio_regra_unidades: consolidate overlapping SELECT policies
DROP POLICY IF EXISTS "dp_bloq_regras_read" ON public.dp_bloqueio_regras;
DROP POLICY IF EXISTS "dp_bloqueio_regras_read_colaborador" ON public.dp_bloqueio_regras;

CREATE POLICY "dp_bloq_regras_read"
  ON public.dp_bloqueio_regras
  FOR SELECT TO authenticated
  USING (
    private.is_company_member(auth.uid(), company_id)
    OR EXISTS (
      SELECT 1 FROM public.dp_colaboradores c
      WHERE c.id = public.dp_colaborador_of(auth.uid())
        AND c.company_id = dp_bloqueio_regras.company_id
    )
  );

DROP POLICY IF EXISTS "dp_bloq_regra_unid_read" ON public.dp_bloqueio_regra_unidades;
DROP POLICY IF EXISTS "dp_bloqueio_regra_unidades_read_colaborador" ON public.dp_bloqueio_regra_unidades;

CREATE POLICY "dp_bloq_regra_unid_read"
  ON public.dp_bloqueio_regra_unidades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dp_bloqueio_regras r
      WHERE r.id = dp_bloqueio_regra_unidades.regra_id
        AND (
          private.is_company_member(auth.uid(), r.company_id)
          OR EXISTS (
            SELECT 1 FROM public.dp_colaboradores c
            WHERE c.id = public.dp_colaborador_of(auth.uid())
              AND c.company_id = r.company_id
          )
        )
    )
  );