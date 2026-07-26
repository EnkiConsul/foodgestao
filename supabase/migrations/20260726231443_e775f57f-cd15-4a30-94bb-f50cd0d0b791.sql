CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dp_colaboradores c
    WHERE c.user_id = _user_id
      AND c.company_id = _company_id
      AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
  );
$$;

DROP POLICY IF EXISTS dp_avisos_read ON public.dp_avisos;
CREATE POLICY dp_avisos_read ON public.dp_avisos
FOR SELECT TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  OR private.is_dp_colaborador_of_company(auth.uid(), company_id)
);

DROP POLICY IF EXISTS dp_comentarios_read ON public.dp_avisos_comentarios;
CREATE POLICY dp_comentarios_read ON public.dp_avisos_comentarios
FOR SELECT TO authenticated
USING (
  (
    private.is_company_member(auth.uid(), company_id)
    OR private.is_dp_colaborador_of_company(auth.uid(), company_id)
  )
  AND (
    status = 'aprovado'
    OR user_id = auth.uid()
    OR private.is_company_admin_or_owner(auth.uid(), company_id)
  )
);

DROP POLICY IF EXISTS dp_comentarios_self_insert ON public.dp_avisos_comentarios;
CREATE POLICY dp_comentarios_self_insert ON public.dp_avisos_comentarios
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    private.is_company_member(auth.uid(), company_id)
    OR private.is_dp_colaborador_of_company(auth.uid(), company_id)
  )
);

DROP POLICY IF EXISTS dp_reacoes_read ON public.dp_avisos_reacoes;
CREATE POLICY dp_reacoes_read ON public.dp_avisos_reacoes
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.dp_avisos a
    WHERE a.id = dp_avisos_reacoes.aviso_id
      AND (
        private.is_company_member(auth.uid(), a.company_id)
        OR private.is_dp_colaborador_of_company(auth.uid(), a.company_id)
      )
  )
);