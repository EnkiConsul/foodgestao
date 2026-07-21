
-- Block F: Categories multi-tenant visibility via category_companies junction

-- CATEGORIES: replace owner-only policy with granular member-aware policies
DROP POLICY IF EXISTS "Users can manage own categories" ON public.categories;

CREATE POLICY "categories_select_owner_or_member"
ON public.categories
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = categories.id
      AND private.is_company_member(auth.uid(), cc.company_id)
  )
);

CREATE POLICY "categories_insert_owner"
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "categories_update_owner_or_editor"
ON public.categories
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = categories.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'categorias')
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = categories.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'categorias')
  )
);

CREATE POLICY "categories_delete_owner_or_editor"
ON public.categories
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.category_companies cc
    WHERE cc.category_id = categories.id
      AND private.member_can_edit(auth.uid(), cc.company_id, 'categorias')
  )
);

-- CATEGORY_COMPANIES: allow member visibility/edit
DROP POLICY IF EXISTS "Users can manage own category companies" ON public.category_companies;

CREATE POLICY "category_companies_select_owner_or_member"
ON public.category_companies
FOR SELECT
TO authenticated
USING (
  private.is_company_member(auth.uid(), company_id)
  OR EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_companies.category_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "category_companies_insert_owner_or_editor"
ON public.category_companies
FOR INSERT
TO authenticated
WITH CHECK (
  private.member_can_edit(auth.uid(), company_id, 'categorias')
  OR EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_companies.category_id AND c.user_id = auth.uid()
  )
);

CREATE POLICY "category_companies_delete_owner_or_editor"
ON public.category_companies
FOR DELETE
TO authenticated
USING (
  private.member_can_edit(auth.uid(), company_id, 'categorias')
  OR EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = category_companies.category_id AND c.user_id = auth.uid()
  )
);
