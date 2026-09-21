-- Correção do erro contact_forbidden: a policy de insert de contact_companies
-- consultava public.contacts, cuja policy de select consulta de volta
-- contact_companies (reentrância). Mesma solução já usada em categorias:
-- função SECURITY DEFINER isolada.
CREATE OR REPLACE FUNCTION private.contact_linkable_by(_user_id uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = _contact_id
      AND (
        c.user_id = _user_id
        OR EXISTS (
          SELECT 1
          FROM public.contact_companies cc
          WHERE cc.contact_id = c.id
            AND private.can_edit_company_module(_user_id, cc.company_id, 'contacts')
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION private.contact_linkable_by(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.contact_linkable_by(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS contact_companies_insert_policy ON public.contact_companies;
CREATE POLICY contact_companies_insert_policy
ON public.contact_companies
FOR INSERT
TO authenticated
WITH CHECK (
  private.can_edit_company_module((SELECT auth.uid()), company_id, 'contacts')
  AND private.contact_linkable_by((SELECT auth.uid()), contact_id)
);

-- Alinha o nome do módulo com a chave realmente usada em company_members.permissions.
CREATE OR REPLACE FUNCTION private.contact_editable_by_member(_uid uuid, _contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = _contact_id
      AND private.member_can_edit(_uid, cc.company_id, 'contacts')
  );
$$;