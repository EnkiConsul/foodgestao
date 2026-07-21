
-- =========================================================================
-- Helpers SECURITY DEFINER para quebrar recursão RLS categories<->category_companies
-- e contacts<->contact_companies.
-- =========================================================================

CREATE OR REPLACE FUNCTION private.user_owns_category(_uid uuid, _category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.categories WHERE id = _category_id AND user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION private.user_owns_contact(_uid uuid, _contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (SELECT 1 FROM public.contacts WHERE id = _contact_id AND user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION private.category_visible_to_member(_uid uuid, _category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = _category_id
      AND private.is_company_member(_uid, cc.company_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.category_editable_by_member(_uid uuid, _category_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = _category_id
      AND private.member_can_edit(_uid, cc.company_id, 'categorias')
  );
$$;

CREATE OR REPLACE FUNCTION private.contact_visible_to_member(_uid uuid, _contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = _contact_id
      AND private.is_company_member(_uid, cc.company_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.contact_editable_by_member(_uid uuid, _contact_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = _contact_id
      AND private.member_can_edit(_uid, cc.company_id, 'contatos')
  );
$$;

-- Hardening: funções em private não são expostas ao PostgREST; ainda assim
-- restringimos execução ao role authenticated.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'user_owns_category(uuid,uuid)',
    'user_owns_contact(uuid,uuid)',
    'category_visible_to_member(uuid,uuid)',
    'category_editable_by_member(uuid,uuid)',
    'contact_visible_to_member(uuid,uuid)',
    'contact_editable_by_member(uuid,uuid)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION private.%s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%s TO authenticated', fn);
  END LOOP;
END $$;

-- =========================================================================
-- CATEGORIES
-- =========================================================================
DROP POLICY IF EXISTS categories_select_owner_or_member ON public.categories;
DROP POLICY IF EXISTS categories_update_owner_or_editor ON public.categories;
DROP POLICY IF EXISTS categories_delete_owner_or_editor ON public.categories;

CREATE POLICY categories_select_owner_or_member ON public.categories
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.category_visible_to_member(auth.uid(), id));

CREATE POLICY categories_update_owner_or_editor ON public.categories
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR private.category_editable_by_member(auth.uid(), id))
WITH CHECK (auth.uid() = user_id OR private.category_editable_by_member(auth.uid(), id));

CREATE POLICY categories_delete_owner_or_editor ON public.categories
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR private.category_editable_by_member(auth.uid(), id));

-- =========================================================================
-- CATEGORY_COMPANIES
-- =========================================================================
DROP POLICY IF EXISTS category_companies_select_owner_or_member ON public.category_companies;
DROP POLICY IF EXISTS category_companies_insert_owner_or_editor ON public.category_companies;
DROP POLICY IF EXISTS category_companies_delete_owner_or_editor ON public.category_companies;

CREATE POLICY category_companies_select_owner_or_member ON public.category_companies
FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id)
       OR private.user_owns_category(auth.uid(), category_id));

CREATE POLICY category_companies_insert_owner_or_editor ON public.category_companies
FOR INSERT TO authenticated
WITH CHECK (private.member_can_edit(auth.uid(), company_id, 'categorias')
            OR private.user_owns_category(auth.uid(), category_id));

CREATE POLICY category_companies_delete_owner_or_editor ON public.category_companies
FOR DELETE TO authenticated
USING (private.member_can_edit(auth.uid(), company_id, 'categorias')
       OR private.user_owns_category(auth.uid(), category_id));

-- =========================================================================
-- CONTACTS
-- =========================================================================
DROP POLICY IF EXISTS contacts_select_owner_or_member ON public.contacts;
DROP POLICY IF EXISTS contacts_update_owner_or_editor ON public.contacts;
DROP POLICY IF EXISTS contacts_delete_owner_or_editor ON public.contacts;

CREATE POLICY contacts_select_owner_or_member ON public.contacts
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR private.contact_visible_to_member(auth.uid(), id));

CREATE POLICY contacts_update_owner_or_editor ON public.contacts
FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR private.contact_editable_by_member(auth.uid(), id))
WITH CHECK (auth.uid() = user_id OR private.contact_editable_by_member(auth.uid(), id));

CREATE POLICY contacts_delete_owner_or_editor ON public.contacts
FOR DELETE TO authenticated
USING (auth.uid() = user_id OR private.contact_editable_by_member(auth.uid(), id));

-- =========================================================================
-- CONTACT_COMPANIES
-- =========================================================================
DROP POLICY IF EXISTS contact_companies_select_owner_or_member ON public.contact_companies;
DROP POLICY IF EXISTS contact_companies_insert_owner_or_editor ON public.contact_companies;
DROP POLICY IF EXISTS contact_companies_delete_owner_or_editor ON public.contact_companies;

CREATE POLICY contact_companies_select_owner_or_member ON public.contact_companies
FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id)
       OR private.user_owns_contact(auth.uid(), contact_id));

CREATE POLICY contact_companies_insert_owner_or_editor ON public.contact_companies
FOR INSERT TO authenticated
WITH CHECK (private.member_can_edit(auth.uid(), company_id, 'contatos')
            OR private.user_owns_contact(auth.uid(), contact_id));

CREATE POLICY contact_companies_delete_owner_or_editor ON public.contact_companies
FOR DELETE TO authenticated
USING (private.member_can_edit(auth.uid(), company_id, 'contatos')
       OR private.user_owns_contact(auth.uid(), contact_id));
