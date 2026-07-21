
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.contacts;

CREATE POLICY "contacts_select_owner_or_member"
ON public.contacts
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = contacts.id
      AND private.is_company_member(auth.uid(), cc.company_id)
  )
);

CREATE POLICY "contacts_insert_owner"
ON public.contacts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update_owner_or_editor"
ON public.contacts
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = contacts.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'contatos')
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = contacts.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'contatos')
  )
);

CREATE POLICY "contacts_delete_owner_or_editor"
ON public.contacts
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = contacts.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'contatos')
  )
);

DROP POLICY IF EXISTS "Users can manage own contact companies" ON public.contact_companies;

CREATE POLICY "contact_companies_select_owner_or_member"
ON public.contact_companies
FOR SELECT
TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_companies.contact_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "contact_companies_insert_owner_or_editor"
ON public.contact_companies
FOR INSERT
TO authenticated
WITH CHECK (
  private.member_can_edit(auth.uid(), company_id, 'contatos')
  OR EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_companies.contact_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "contact_companies_delete_owner_or_editor"
ON public.contact_companies
FOR DELETE
TO authenticated
USING (
  private.member_can_edit(auth.uid(), company_id, 'contatos')
  OR EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_companies.contact_id AND c.user_id = auth.uid()
  )
);
