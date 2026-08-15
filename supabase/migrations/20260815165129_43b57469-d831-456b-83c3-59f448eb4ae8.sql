CREATE OR REPLACE FUNCTION private.is_company_accountant(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id
      AND company_id = _company_id
      AND role = 'contabilidade'::public.company_role
  )
$$;

REVOKE ALL ON FUNCTION private.is_company_accountant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_company_accountant(uuid, uuid) TO authenticated, service_role;

-- Papel Contabilidade nunca tem permissão de escrita
CREATE OR REPLACE FUNCTION private.member_can_edit(_user_id uuid, _company_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT CASE
    WHEN private.is_company_accountant(_user_id, _company_id) THEN false
    ELSE COALESCE(private.member_permission(_user_id, _company_id, _module) = 'edit', false)
  END;
$$;

-- Contas: contador só vê contas contábeis
DROP POLICY IF EXISTS "Company members can view company accounts" ON public.accounts;
CREATE POLICY "Company members can view company accounts"
ON public.accounts
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND private.is_company_member((SELECT auth.uid()), company_id)
  AND (
    is_accounting
    OR NOT private.is_company_accountant((SELECT auth.uid()), company_id)
  )
);

-- Lançamentos: contador só vê os vinculados a contas contábeis
DROP POLICY IF EXISTS "Company members can view company transactions" ON public.transactions;
CREATE POLICY "Company members can view company transactions"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  company_id IS NOT NULL
  AND private.is_company_member((SELECT auth.uid()), company_id)
  AND (
    NOT private.is_company_accountant((SELECT auth.uid()), company_id)
    OR (
      EXISTS (
        SELECT 1 FROM public.accounts a
        WHERE a.id = transactions.account_id AND a.is_accounting
      )
      AND (
        destination_account_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.accounts d
          WHERE d.id = transactions.destination_account_id AND d.is_accounting
        )
      )
    )
  )
);