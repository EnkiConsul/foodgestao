ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS visible_pf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS update_cost_centers_updated_at ON public.cost_centers;
CREATE TRIGGER update_cost_centers_updated_at
  BEFORE UPDATE ON public.cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS cost_centers_user_name_uniq
  ON public.cost_centers (user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.cost_center_companies (
  cost_center_id uuid NOT NULL REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cost_center_id, company_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cost_center_companies TO authenticated;
GRANT ALL ON public.cost_center_companies TO service_role;

ALTER TABLE public.cost_center_companies ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_cost_center_companies_company ON public.cost_center_companies(company_id);

CREATE POLICY "cost_center_companies_select_policy"
ON public.cost_center_companies FOR SELECT TO authenticated
USING (
  private.can_view_company_module(auth.uid(), company_id, 'cost_centers')
  OR EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid())
);

CREATE POLICY "cost_center_companies_insert_policy"
ON public.cost_center_companies FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid())
  OR private.can_edit_company_module(auth.uid(), company_id, 'cost_centers')
);

CREATE POLICY "cost_center_companies_delete_policy"
ON public.cost_center_companies FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.cost_centers cc WHERE cc.id = cost_center_id AND cc.user_id = auth.uid())
  OR private.can_edit_company_module(auth.uid(), company_id, 'cost_centers')
);

DROP POLICY IF EXISTS "Users can manage own cost centers" ON public.cost_centers;

CREATE POLICY "cost_centers_owner_all"
ON public.cost_centers FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cost_centers_member_select"
ON public.cost_centers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cost_center_companies ccc
    WHERE ccc.cost_center_id = cost_centers.id
      AND private.can_view_company_module(auth.uid(), ccc.company_id, 'cost_centers')
  )
);

CREATE POLICY "cost_centers_member_update"
ON public.cost_centers FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cost_center_companies ccc
    WHERE ccc.cost_center_id = cost_centers.id
      AND private.can_edit_company_module(auth.uid(), ccc.company_id, 'cost_centers')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.cost_center_companies ccc
    WHERE ccc.cost_center_id = cost_centers.id
      AND private.can_edit_company_module(auth.uid(), ccc.company_id, 'cost_centers')
  )
);