CREATE OR REPLACE FUNCTION private.cost_center_owner(_cc uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT user_id FROM public.cost_centers WHERE id = _cc
$$;

CREATE OR REPLACE FUNCTION private.cost_center_company_ids(_cc uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private AS $$
  SELECT company_id FROM public.cost_center_companies WHERE cost_center_id = _cc
$$;

REVOKE ALL ON FUNCTION private.cost_center_owner(uuid) FROM public;
REVOKE ALL ON FUNCTION private.cost_center_company_ids(uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.cost_center_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.cost_center_company_ids(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS cost_centers_member_select ON public.cost_centers;
CREATE POLICY cost_centers_member_select ON public.cost_centers
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS cid
  WHERE private.can_view_company_module(auth.uid(), cid, 'cost_centers')
));

DROP POLICY IF EXISTS cost_centers_member_update ON public.cost_centers;
CREATE POLICY cost_centers_member_update ON public.cost_centers
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS cid
  WHERE private.can_edit_company_module(auth.uid(), cid, 'cost_centers')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM private.cost_center_company_ids(cost_centers.id) AS cid
  WHERE private.can_edit_company_module(auth.uid(), cid, 'cost_centers')
));

DROP POLICY IF EXISTS cost_center_companies_select_policy ON public.cost_center_companies;
CREATE POLICY cost_center_companies_select_policy ON public.cost_center_companies
FOR SELECT TO authenticated
USING (
  private.cost_center_owner(cost_center_id) = auth.uid()
  OR private.can_view_company_module(auth.uid(), company_id, 'cost_centers')
);

DROP POLICY IF EXISTS cost_center_companies_insert_policy ON public.cost_center_companies;
CREATE POLICY cost_center_companies_insert_policy ON public.cost_center_companies
FOR INSERT TO authenticated
WITH CHECK (
  private.cost_center_owner(cost_center_id) = auth.uid()
  OR private.can_edit_company_module(auth.uid(), company_id, 'cost_centers')
);

DROP POLICY IF EXISTS cost_center_companies_delete_policy ON public.cost_center_companies;
CREATE POLICY cost_center_companies_delete_policy ON public.cost_center_companies
FOR DELETE TO authenticated
USING (
  private.cost_center_owner(cost_center_id) = auth.uid()
  OR private.can_edit_company_module(auth.uid(), company_id, 'cost_centers')
);