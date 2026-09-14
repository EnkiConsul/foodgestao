CREATE OR REPLACE FUNCTION public.is_dp_colaborador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.dp_colaboradores c
    WHERE _user_id IS NOT NULL
      -- Só responde sobre a própria sessão; servidor/jobs seguem livres.
      AND (
        _user_id = auth.uid()
        OR auth.uid() IS NULL
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
        OR auth.role() = 'service_role'
      )
      AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.sou_dp_colaborador()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_dp_colaborador(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.sou_dp_colaborador() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sou_dp_colaborador() FROM anon;
GRANT EXECUTE ON FUNCTION public.sou_dp_colaborador() TO authenticated, service_role;