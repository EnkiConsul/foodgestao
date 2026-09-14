-- =====================================================================
-- Fase 3 — identidade do colaborador derivada exclusivamente da sessão
-- =====================================================================

-- 1) Fonte única: colaborador da própria sessão -------------------------
CREATE OR REPLACE FUNCTION public.dp_meu_colaborador()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    WHERE auth.uid() IS NOT NULL
      AND private.dp_access_enabled(auth.uid())
      AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND c.user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = auth.uid()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = auth.uid()
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  -- Conflito de vínculo falha fechado: nada é devolvido.
  SELECT id FROM candidatos WHERE (SELECT count(*) FROM candidatos) = 1;
$$;

REVOKE ALL ON FUNCTION public.dp_meu_colaborador() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_meu_colaborador() FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_colaborador() TO authenticated, service_role;

-- 2) Vínculo completo da própria sessão --------------------------------
CREATE OR REPLACE FUNCTION public.dp_meu_vinculo()
RETURNS TABLE (
  colaborador_id uuid,
  company_id uuid,
  unidade_id uuid,
  unidade_nome text,
  unidade_usa_ponto boolean,
  nome text,
  regime text,
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
         c.ativo,
         c.acesso_portal_ate
    FROM public.dp_colaboradores c
    LEFT JOIN public.dp_unidades u ON u.id = c.unidade_id
   WHERE c.id = public.dp_meu_colaborador();
$$;

REVOKE ALL ON FUNCTION public.dp_meu_vinculo() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dp_meu_vinculo() FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_meu_vinculo() TO authenticated, service_role;

-- 3) As funções com parâmetro deixam de responder sobre terceiros ------
-- As policies existentes passam auth.uid(), então continuam válidas.
-- O servidor (service_role) segue podendo consultar outro colaborador.
CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH autorizado AS (
    SELECT _user_id AS uid
    WHERE _user_id IS NOT NULL
      AND (
        _user_id = auth.uid()
        OR auth.uid() IS NULL -- contexto de servidor / job interno
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
        OR auth.role() = 'service_role'
      )
  ),
  candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    JOIN autorizado a ON a.uid = c.user_id
    WHERE private.dp_access_enabled(a.uid)
      AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = a.uid
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = a.uid
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos WHERE (SELECT count(*) FROM candidatos) = 1;
$$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH autorizado AS (
    SELECT _user_id AS uid
    WHERE _user_id IS NOT NULL
      AND (
        _user_id = auth.uid()
        OR auth.uid() IS NULL
        OR current_setting('request.jwt.claim.role', true) = 'service_role'
        OR auth.role() = 'service_role'
      )
  ),
  candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    JOIN autorizado a ON a.uid = c.user_id
    WHERE private.dp_access_enabled(a.uid)
      AND c.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = a.uid
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = a.uid
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos WHERE (SELECT count(*) FROM candidatos) = 1;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_colaborador_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dp_colaborador_ativo_of(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_of(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dp_colaborador_ativo_of(uuid) TO authenticated, service_role;