
-- ============================================================================
-- BLOCO 1: Funções canônicas de autorização por módulo
-- ============================================================================

CREATE OR REPLACE FUNCTION private.can_view_company_module(
  _user_id uuid,
  _company_id uuid,
  _module text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _company_id IS NOT NULL
    AND (
      public.is_super_admin(_user_id)
      OR (
        private.is_company_member(_user_id, _company_id)
        AND private.member_permission(_user_id, _company_id, _module) IN ('view','edit')
      )
    );
$$;

CREATE OR REPLACE FUNCTION private.can_edit_company_module(
  _user_id uuid,
  _company_id uuid,
  _module text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id IS NOT NULL
    AND _company_id IS NOT NULL
    AND (
      public.is_super_admin(_user_id)
      OR (
        private.is_company_member(_user_id, _company_id)
        AND private.member_permission(_user_id, _company_id, _module) = 'edit'
      )
    );
$$;

REVOKE ALL ON FUNCTION private.can_view_company_module(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_edit_company_module(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_company_module(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_company_module(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- BLOCO 2: category_companies — remover fallback do criador, exigir membership
-- ============================================================================

DROP POLICY IF EXISTS category_companies_select_owner_or_member ON public.category_companies;
DROP POLICY IF EXISTS category_companies_insert_owner_or_editor ON public.category_companies;
DROP POLICY IF EXISTS category_companies_delete_owner_or_editor ON public.category_companies;

CREATE POLICY category_companies_select_policy
  ON public.category_companies
  FOR SELECT
  TO authenticated
  USING (private.can_view_company_module(auth.uid(), company_id, 'categories'));

CREATE POLICY category_companies_insert_policy
  ON public.category_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'categories')
    AND EXISTS (
      SELECT 1
      FROM public.categories c
      WHERE c.id = category_id
        AND (c.context IS NULL OR c.context = 'pj')
    )
  );

CREATE POLICY category_companies_delete_policy
  ON public.category_companies
  FOR DELETE
  TO authenticated
  USING (private.can_edit_company_module(auth.uid(), company_id, 'categories'));

REVOKE ALL ON public.category_companies FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.category_companies TO authenticated;
GRANT ALL ON public.category_companies TO service_role;

CREATE INDEX IF NOT EXISTS idx_category_companies_company ON public.category_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_category_companies_category ON public.category_companies(category_id);

-- ============================================================================
-- BLOCO 3: contact_companies — mesma política, módulo 'contacts'
-- ============================================================================

DROP POLICY IF EXISTS contact_companies_select_owner_or_member ON public.contact_companies;
DROP POLICY IF EXISTS contact_companies_insert_owner_or_editor ON public.contact_companies;
DROP POLICY IF EXISTS contact_companies_delete_owner_or_editor ON public.contact_companies;

CREATE POLICY contact_companies_select_policy
  ON public.contact_companies
  FOR SELECT
  TO authenticated
  USING (private.can_view_company_module(auth.uid(), company_id, 'contacts'));

CREATE POLICY contact_companies_insert_policy
  ON public.contact_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'contacts')
    AND EXISTS (
      SELECT 1 FROM public.contacts c WHERE c.id = contact_id
    )
  );

CREATE POLICY contact_companies_delete_policy
  ON public.contact_companies
  FOR DELETE
  TO authenticated
  USING (private.can_edit_company_module(auth.uid(), company_id, 'contacts'));

REVOKE ALL ON public.contact_companies FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.contact_companies TO authenticated;
GRANT ALL ON public.contact_companies TO service_role;

CREATE INDEX IF NOT EXISTS idx_contact_companies_company ON public.contact_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_contact_companies_contact ON public.contact_companies(contact_id);

-- ============================================================================
-- BLOCO 4: payment_method_companies — FOR ALL público → SELECT/INSERT/DELETE
-- ============================================================================

DROP POLICY IF EXISTS "Users can manage own payment method companies" ON public.payment_method_companies;

CREATE POLICY payment_method_companies_select_policy
  ON public.payment_method_companies
  FOR SELECT
  TO authenticated
  USING (private.can_view_company_module(auth.uid(), company_id, 'payment_methods'));

CREATE POLICY payment_method_companies_insert_policy
  ON public.payment_method_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'payment_methods')
    AND EXISTS (
      SELECT 1 FROM public.payment_methods pm WHERE pm.id = payment_method_id
    )
  );

CREATE POLICY payment_method_companies_delete_policy
  ON public.payment_method_companies
  FOR DELETE
  TO authenticated
  USING (private.can_edit_company_module(auth.uid(), company_id, 'payment_methods'));

REVOKE ALL ON public.payment_method_companies FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.payment_method_companies TO authenticated;
GRANT ALL ON public.payment_method_companies TO service_role;

CREATE INDEX IF NOT EXISTS idx_payment_method_companies_company ON public.payment_method_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_companies_payment_method ON public.payment_method_companies(payment_method_id);

-- ============================================================================
-- BLOCO 5: chart_account_companies — FOR ALL público → SELECT/INSERT/DELETE
-- ============================================================================

DROP POLICY IF EXISTS chart_account_companies_owner_all ON public.chart_account_companies;

CREATE POLICY chart_account_companies_select_policy
  ON public.chart_account_companies
  FOR SELECT
  TO authenticated
  USING (private.can_view_company_module(auth.uid(), company_id, 'chart_accounts'));

CREATE POLICY chart_account_companies_insert_policy
  ON public.chart_account_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'chart_accounts')
    AND EXISTS (
      SELECT 1 FROM public.chart_accounts ca WHERE ca.id = chart_account_id
    )
  );

CREATE POLICY chart_account_companies_delete_policy
  ON public.chart_account_companies
  FOR DELETE
  TO authenticated
  USING (private.can_edit_company_module(auth.uid(), company_id, 'chart_accounts'));

REVOKE ALL ON public.chart_account_companies FROM anon, PUBLIC;
GRANT SELECT, INSERT, DELETE ON public.chart_account_companies TO authenticated;
GRANT ALL ON public.chart_account_companies TO service_role;

CREATE INDEX IF NOT EXISTS idx_chart_account_companies_company ON public.chart_account_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_chart_account_companies_chart_account ON public.chart_account_companies(chart_account_id);

-- ============================================================================
-- BLOCO 6: Trigger de integridade cross-tenant (BEFORE UPDATE)
-- Bloqueia troca de company_id e da coluna da entidade vinculada.
-- ============================================================================

CREATE OR REPLACE FUNCTION private.prevent_association_tenant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  is_admin boolean := public.is_super_admin(auth.uid());
BEGIN
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Cross-tenant transfer denied on % (company_id imutável)', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'category_companies' AND NEW.category_id IS DISTINCT FROM OLD.category_id THEN
    RAISE EXCEPTION 'category_id imutável em category_companies' USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'contact_companies' AND NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
    RAISE EXCEPTION 'contact_id imutável em contact_companies' USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'payment_method_companies' AND NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id THEN
    RAISE EXCEPTION 'payment_method_id imutável em payment_method_companies' USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'chart_account_companies' AND NEW.chart_account_id IS DISTINCT FROM OLD.chart_account_id THEN
    RAISE EXCEPTION 'chart_account_id imutável em chart_account_companies' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_tenant_change ON public.category_companies;
CREATE TRIGGER trg_prevent_tenant_change
  BEFORE UPDATE ON public.category_companies
  FOR EACH ROW EXECUTE FUNCTION private.prevent_association_tenant_change();

DROP TRIGGER IF EXISTS trg_prevent_tenant_change ON public.contact_companies;
CREATE TRIGGER trg_prevent_tenant_change
  BEFORE UPDATE ON public.contact_companies
  FOR EACH ROW EXECUTE FUNCTION private.prevent_association_tenant_change();

DROP TRIGGER IF EXISTS trg_prevent_tenant_change ON public.payment_method_companies;
CREATE TRIGGER trg_prevent_tenant_change
  BEFORE UPDATE ON public.payment_method_companies
  FOR EACH ROW EXECUTE FUNCTION private.prevent_association_tenant_change();

DROP TRIGGER IF EXISTS trg_prevent_tenant_change ON public.chart_account_companies;
CREATE TRIGGER trg_prevent_tenant_change
  BEFORE UPDATE ON public.chart_account_companies
  FOR EACH ROW EXECUTE FUNCTION private.prevent_association_tenant_change();

-- ============================================================================
-- BLOCO 7: View diagnóstica para lint de regressão
-- ============================================================================

CREATE OR REPLACE VIEW private.rls_associative_audit AS
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check,
  (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) ILIKE '%user_owns_%' AS has_owner_fallback,
  (COALESCE(qual,'') || ' ' || COALESCE(with_check,'')) ILIKE '%.user_id = auth.uid()%' AS has_user_id_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename LIKE '%\_companies' ESCAPE '\' OR tablename LIKE '%\_company' ESCAPE '\');

REVOKE ALL ON private.rls_associative_audit FROM PUBLIC;
GRANT SELECT ON private.rls_associative_audit TO service_role;
