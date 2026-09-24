-- 1) Colunas de contas liberadas (NULL = todas as contas)
ALTER TABLE public.company_members ADD COLUMN IF NOT EXISTS contas_permitidas uuid[];
ALTER TABLE public.company_invites ADD COLUMN IF NOT EXISTS contas_permitidas uuid[];

-- 2) Helpers
CREATE OR REPLACE FUNCTION private.contas_permitidas(_user_id uuid, _company_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
           WHEN cm.role IN ('owner','admin') THEN NULL::uuid[]
           WHEN cm.contas_permitidas IS NULL OR cardinality(cm.contas_permitidas) = 0 THEN NULL::uuid[]
           ELSE cm.contas_permitidas
         END
  FROM public.company_members cm
  WHERE cm.user_id = _user_id AND cm.company_id = _company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION private.contas_permitidas(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.conta_liberada(_company_id uuid, _account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_lista uuid[];
BEGIN
  IF _company_id IS NULL OR _account_id IS NULL THEN
    RETURN true;
  END IF;
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin(auth.uid()) THEN
    RETURN true;
  END IF;
  v_lista := private.contas_permitidas(auth.uid(), _company_id);
  IF v_lista IS NULL THEN
    RETURN true;
  END IF;
  RETURN _account_id = ANY(v_lista);
END;
$$;

REVOKE ALL ON FUNCTION public.conta_liberada(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.conta_liberada(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.conta_liberada(uuid, uuid) TO authenticated, service_role;

-- Lista para a interface: contas liberadas do próprio usuário na empresa
CREATE OR REPLACE FUNCTION public.minhas_contas_permitidas(_company_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.is_company_member(auth.uid(), _company_id) THEN
    RETURN NULL;
  END IF;
  RETURN private.contas_permitidas(auth.uid(), _company_id);
END;
$$;

REVOKE ALL ON FUNCTION public.minhas_contas_permitidas(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.minhas_contas_permitidas(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.minhas_contas_permitidas(uuid) TO authenticated, service_role;

-- 3) Filtro no leitor de contas usado pelas telas
CREATE OR REPLACE FUNCTION public.get_accessible_accounts(
  _context context_type,
  _company_id uuid DEFAULT NULL,
  _include_inactive boolean DEFAULT false
)
RETURNS SETOF public.accounts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_accountant boolean := false;
  v_contas uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN
      RETURN;
    END IF;
    IF NOT private.is_company_member(auth.uid(), _company_id) THEN
      RAISE EXCEPTION 'Not a member of this company' USING ERRCODE = '42501';
    END IF;
    v_accountant := private.is_company_accountant(auth.uid(), _company_id);
    v_contas := private.contas_permitidas(auth.uid(), _company_id);
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pj'
        AND a.company_id = _company_id
        AND (NOT v_accountant OR a.is_accounting)
        AND (v_contas IS NULL OR a.id = ANY(v_contas))
      ORDER BY a.name;
  ELSE
    RETURN QUERY
      SELECT a.* FROM public.accounts a
      WHERE (_include_inactive OR a.is_active = true)
        AND a.context = 'pf'
        AND a.user_id = auth.uid()
        AND a.company_id IS NULL
      ORDER BY a.name;
  END IF;
END;
$$;

-- 4) Bloqueio no banco: contas e lançamentos fora da lista não são lidos
DROP POLICY IF EXISTS "perm_contas_liberadas_select" ON public.accounts;
CREATE POLICY "perm_contas_liberadas_select" ON public.accounts
AS RESTRICTIVE FOR SELECT TO authenticated
USING (company_id IS NULL OR public.conta_liberada(company_id, id));

DROP POLICY IF EXISTS "perm_contas_liberadas_tx_select" ON public.transactions;
CREATE POLICY "perm_contas_liberadas_tx_select" ON public.transactions
AS RESTRICTIVE FOR SELECT TO authenticated
USING (company_id IS NULL OR account_id IS NULL OR public.conta_liberada(company_id, account_id));