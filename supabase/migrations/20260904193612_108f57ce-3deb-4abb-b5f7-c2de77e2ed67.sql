-- 1. Etiquetas ganham vínculo de empresa
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_tags_company_id ON public.tags(company_id);

-- 2. CATEGORIAS ------------------------------------------------------------
DROP POLICY IF EXISTS categories_select_owner_or_member ON public.categories;
DROP POLICY IF EXISTS categories_update_owner_or_editor ON public.categories;
DROP POLICY IF EXISTS categories_delete_owner_or_editor ON public.categories;

CREATE POLICY categories_select_scoped ON public.categories
FOR SELECT TO authenticated
USING (
  private.category_visible_to_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.category_companies cc WHERE cc.category_id = categories.id)
  )
);

CREATE POLICY categories_update_scoped ON public.categories
FOR UPDATE TO authenticated
USING (
  private.category_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.category_companies cc WHERE cc.category_id = categories.id)
  )
)
WITH CHECK (
  private.category_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.category_companies cc WHERE cc.category_id = categories.id)
  )
);

CREATE POLICY categories_delete_scoped ON public.categories
FOR DELETE TO authenticated
USING (
  private.category_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.category_companies cc WHERE cc.category_id = categories.id)
  )
);

-- 3. CONTATOS -------------------------------------------------------------
DROP POLICY IF EXISTS contacts_select_owner_or_member ON public.contacts;
DROP POLICY IF EXISTS contacts_update_owner_or_editor ON public.contacts;
DROP POLICY IF EXISTS contacts_delete_owner_or_editor ON public.contacts;

CREATE POLICY contacts_select_scoped ON public.contacts
FOR SELECT TO authenticated
USING (
  private.contact_visible_to_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.contact_companies cc WHERE cc.contact_id = contacts.id)
  )
);

CREATE POLICY contacts_update_scoped ON public.contacts
FOR UPDATE TO authenticated
USING (
  private.contact_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.contact_companies cc WHERE cc.contact_id = contacts.id)
  )
)
WITH CHECK (
  private.contact_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.contact_companies cc WHERE cc.contact_id = contacts.id)
  )
);

CREATE POLICY contacts_delete_scoped ON public.contacts
FOR DELETE TO authenticated
USING (
  private.contact_editable_by_member((SELECT auth.uid()), id)
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.contact_companies cc WHERE cc.contact_id = contacts.id)
  )
);

-- 4. CENTROS DE CUSTO -----------------------------------------------------
DROP POLICY IF EXISTS cost_centers_owner_all ON public.cost_centers;
DROP POLICY IF EXISTS cost_centers_member_select ON public.cost_centers;
DROP POLICY IF EXISTS cost_centers_member_update ON public.cost_centers;

CREATE POLICY cost_centers_insert_owner ON public.cost_centers
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY cost_centers_select_scoped ON public.cost_centers
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS t(cid)
    WHERE private.can_view_company_module((SELECT auth.uid()), t.cid, 'cost_centers')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.cost_center_companies cc WHERE cc.cost_center_id = cost_centers.id)
  )
);

CREATE POLICY cost_centers_update_scoped ON public.cost_centers
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS t(cid)
    WHERE private.can_edit_company_module((SELECT auth.uid()), t.cid, 'cost_centers')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.cost_center_companies cc WHERE cc.cost_center_id = cost_centers.id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS t(cid)
    WHERE private.can_edit_company_module((SELECT auth.uid()), t.cid, 'cost_centers')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.cost_center_companies cc WHERE cc.cost_center_id = cost_centers.id)
  )
);

CREATE POLICY cost_centers_delete_scoped ON public.cost_centers
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS t(cid)
    WHERE private.can_edit_company_module((SELECT auth.uid()), t.cid, 'cost_centers')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.cost_center_companies cc WHERE cc.cost_center_id = cost_centers.id)
  )
);

-- 5. FORMAS DE PAGAMENTO --------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own payment methods" ON public.payment_methods;

CREATE POLICY payment_methods_insert_owner ON public.payment_methods
FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY payment_methods_select_scoped ON public.payment_methods
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = payment_methods.id
      AND private.is_company_member((SELECT auth.uid()), pmc.company_id)
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.payment_method_companies pmc WHERE pmc.payment_method_id = payment_methods.id)
  )
);

CREATE POLICY payment_methods_update_scoped ON public.payment_methods
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = payment_methods.id
      AND private.member_can_edit((SELECT auth.uid()), pmc.company_id, 'payment_methods')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.payment_method_companies pmc WHERE pmc.payment_method_id = payment_methods.id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = payment_methods.id
      AND private.member_can_edit((SELECT auth.uid()), pmc.company_id, 'payment_methods')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.payment_method_companies pmc WHERE pmc.payment_method_id = payment_methods.id)
  )
);

CREATE POLICY payment_methods_delete_scoped ON public.payment_methods
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = payment_methods.id
      AND private.member_can_edit((SELECT auth.uid()), pmc.company_id, 'payment_methods')
  )
  OR (
    (SELECT auth.uid()) = user_id
    AND NOT EXISTS (SELECT 1 FROM public.payment_method_companies pmc WHERE pmc.payment_method_id = payment_methods.id)
  )
);

-- 6. ETIQUETAS ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can manage own tags" ON public.tags;

CREATE POLICY tags_insert_owner ON public.tags
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (company_id IS NULL OR private.is_company_member((SELECT auth.uid()), company_id))
);

CREATE POLICY tags_select_scoped ON public.tags
FOR SELECT TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY tags_update_scoped ON public.tags
FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
)
WITH CHECK (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY tags_delete_scoped ON public.tags
FOR DELETE TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

-- 7. REGRAS DE IMPORTAÇÃO -------------------------------------------------
DROP POLICY IF EXISTS "Users manage own import rules" ON public.import_rules;

CREATE POLICY import_rules_insert_owner ON public.import_rules
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (company_id IS NULL OR private.is_company_member((SELECT auth.uid()), company_id))
);

CREATE POLICY import_rules_select_scoped ON public.import_rules
FOR SELECT TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY import_rules_update_scoped ON public.import_rules
FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
)
WITH CHECK (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY import_rules_delete_scoped ON public.import_rules
FOR DELETE TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

-- 8. FATURAS DE CARTÃO ----------------------------------------------------
DROP POLICY IF EXISTS cc_invoices_select ON public.credit_card_invoices;
DROP POLICY IF EXISTS cc_invoices_update ON public.credit_card_invoices;
DROP POLICY IF EXISTS cc_invoices_delete ON public.credit_card_invoices;

CREATE POLICY cc_invoices_select ON public.credit_card_invoices
FOR SELECT TO authenticated
USING (
  (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY cc_invoices_update ON public.credit_card_invoices
FOR UPDATE TO authenticated
USING (
  (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
)
WITH CHECK (
  (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

CREATE POLICY cc_invoices_delete ON public.credit_card_invoices
FOR DELETE TO authenticated
USING (
  (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'))
  OR (company_id IS NULL AND (SELECT auth.uid()) = user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rules TO authenticated;
GRANT ALL ON public.import_rules TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_centers TO authenticated;
GRANT ALL ON public.cost_centers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;