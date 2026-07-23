
-- chart_accounts
DROP POLICY IF EXISTS "chart_accounts_owner_all" ON public.chart_accounts;
CREATE POLICY "chart_accounts_owner_all" ON public.chart_accounts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- cost_centers
DROP POLICY IF EXISTS "Users can manage own cost centers" ON public.cost_centers;
CREATE POLICY "Users can manage own cost centers" ON public.cost_centers
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- import_rules
DROP POLICY IF EXISTS "Users manage own import rules" ON public.import_rules;
CREATE POLICY "Users manage own import rules" ON public.import_rules
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- payment_methods
DROP POLICY IF EXISTS "Users can manage own payment methods" ON public.payment_methods;
CREATE POLICY "Users can manage own payment methods" ON public.payment_methods
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- tags
DROP POLICY IF EXISTS "Users can manage own tags" ON public.tags;
CREATE POLICY "Users can manage own tags" ON public.tags
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- dp_solicitacoes colaborador self insert
DROP POLICY IF EXISTS "dp_sol_colab_self_write" ON public.dp_solicitacoes;
CREATE POLICY "dp_sol_colab_self_write" ON public.dp_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    (colaborador_id = dp_colaborador_of(auth.uid()))
    AND (company_id = (
      SELECT c.company_id FROM dp_colaboradores c
      WHERE c.id = dp_colaborador_of(auth.uid())
    ))
  );
