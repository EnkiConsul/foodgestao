
-- 1) dp_cadastro_solicitacoes: restringir aprovações/leituras a admin/owner
DROP POLICY IF EXISTS company_admins_manage_cadastro ON public.dp_cadastro_solicitacoes;

CREATE POLICY admins_select_cadastro
  ON public.dp_cadastro_solicitacoes
  FOR SELECT
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY admins_update_cadastro
  ON public.dp_cadastro_solicitacoes
  FOR UPDATE
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id))
  WITH CHECK (private.is_company_admin_or_owner(auth.uid(), company_id));

CREATE POLICY admins_delete_cadastro
  ON public.dp_cadastro_solicitacoes
  FOR DELETE
  TO authenticated
  USING (private.is_company_admin_or_owner(auth.uid(), company_id));

-- 2) Junction tables: exigir ownership da entidade referenciada no INSERT
DROP POLICY IF EXISTS category_companies_insert_policy ON public.category_companies;
CREATE POLICY category_companies_insert_policy
  ON public.category_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'categories'::text)
    AND EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = category_companies.category_id
        AND c.user_id = auth.uid()
        AND (c.context IS NULL OR c.context = 'pj'::context_type)
    )
  );

DROP POLICY IF EXISTS chart_account_companies_insert_policy ON public.chart_account_companies;
CREATE POLICY chart_account_companies_insert_policy
  ON public.chart_account_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'chart_accounts'::text)
    AND EXISTS (
      SELECT 1 FROM public.chart_accounts ca
      WHERE ca.id = chart_account_companies.chart_account_id
        AND ca.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS contact_companies_insert_policy ON public.contact_companies;
CREATE POLICY contact_companies_insert_policy
  ON public.contact_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'contacts'::text)
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_companies.contact_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS payment_method_companies_insert_policy ON public.payment_method_companies;
CREATE POLICY payment_method_companies_insert_policy
  ON public.payment_method_companies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.can_edit_company_module(auth.uid(), company_id, 'payment_methods'::text)
    AND EXISTS (
      SELECT 1 FROM public.payment_methods pm
      WHERE pm.id = payment_method_companies.payment_method_id
        AND pm.user_id = auth.uid()
    )
  );
