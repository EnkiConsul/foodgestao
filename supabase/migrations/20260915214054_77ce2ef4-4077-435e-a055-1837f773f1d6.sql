DROP POLICY IF EXISTS "pluggy_connections_member_write" ON public.pluggy_connections;
DROP POLICY IF EXISTS "pluggy_connections_member_update" ON public.pluggy_connections;
DROP POLICY IF EXISTS "pluggy_connections_member_delete" ON public.pluggy_connections;

CREATE POLICY "pluggy_connections_editor_insert" ON public.pluggy_connections FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pluggy_connections_editor_update" ON public.pluggy_connections FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')))
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pluggy_connections_editor_delete" ON public.pluggy_connections FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));

DROP POLICY IF EXISTS "pluggy_accounts_member_all" ON public.pluggy_accounts;
CREATE POLICY "pluggy_accounts_member_read" ON public.pluggy_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "pluggy_accounts_editor_insert" ON public.pluggy_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pluggy_accounts_editor_update" ON public.pluggy_accounts FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')))
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pluggy_accounts_editor_delete" ON public.pluggy_accounts FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));

DROP POLICY IF EXISTS "pv2_conn_company_all" ON public.pluggy_v2_connections;
CREATE POLICY "pv2_conn_company_read" ON public.pluggy_v2_connections FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "pv2_conn_editor_insert" ON public.pluggy_v2_connections FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pv2_conn_editor_update" ON public.pluggy_v2_connections FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')))
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pv2_conn_editor_delete" ON public.pluggy_v2_connections FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));

DROP POLICY IF EXISTS "pv2_acc_company_all" ON public.pluggy_v2_accounts;
CREATE POLICY "pv2_acc_company_read" ON public.pluggy_v2_accounts FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "pv2_acc_editor_insert" ON public.pluggy_v2_accounts FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pv2_acc_editor_update" ON public.pluggy_v2_accounts FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')))
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));
CREATE POLICY "pv2_acc_editor_delete" ON public.pluggy_v2_accounts FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'accounts')));

DROP POLICY IF EXISTS "pv2_tx_company_all" ON public.pluggy_v2_transactions_raw;
CREATE POLICY "pv2_tx_company_read" ON public.pluggy_v2_transactions_raw FOR SELECT TO authenticated
  USING (company_id IN (SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()));
CREATE POLICY "pv2_tx_editor_insert" ON public.pluggy_v2_transactions_raw FOR INSERT TO authenticated
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'transactions')));
CREATE POLICY "pv2_tx_editor_update" ON public.pluggy_v2_transactions_raw FOR UPDATE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'transactions')))
  WITH CHECK (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'transactions')));
CREATE POLICY "pv2_tx_editor_delete" ON public.pluggy_v2_transactions_raw FOR DELETE TO authenticated
  USING (company_id IS NOT NULL AND (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.user_id = auth.uid()) OR private.member_can_edit(auth.uid(), company_id, 'transactions')));