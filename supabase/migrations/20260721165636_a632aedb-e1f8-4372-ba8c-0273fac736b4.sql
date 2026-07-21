
-- =========================================================
-- Bloco E — Multiempresa em budgets
-- Pré-condição: tabela pública budgets existe, 0 linhas.
-- Rollback:
--   DROP POLICY … budgets_*_policy ON public.budgets;
--   CREATE POLICY "Users can manage own budgets" ON public.budgets FOR ALL
--     USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
--   ALTER TABLE public.budgets DROP CONSTRAINT budgets_context_company_check;
--   ALTER TABLE public.budgets DROP COLUMN company_id;
-- =========================================================

-- 1) Estrutura
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS company_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'budgets_company_id_fkey'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_company_id_fkey
      FOREIGN KEY (company_id)
      REFERENCES public.companies(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budgets_company_id
  ON public.budgets(company_id);
CREATE INDEX IF NOT EXISTS idx_budgets_company_context
  ON public.budgets(company_id, context);
CREATE INDEX IF NOT EXISTS idx_budgets_company_category
  ON public.budgets(company_id, category_id);

-- 2) Constraint de coerência PF/PJ (tabela vazia => VALID direto)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'budgets_context_company_check'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_context_company_check
      CHECK (
        (context = 'pf' AND company_id IS NULL)
        OR
        (context = 'pj' AND company_id IS NOT NULL)
      );
  END IF;
END $$;

-- 3) RLS: substituir policy única por policies por operação
DROP POLICY IF EXISTS "Users can manage own budgets" ON public.budgets;
DROP POLICY IF EXISTS budgets_select_policy ON public.budgets;
DROP POLICY IF EXISTS budgets_insert_policy ON public.budgets;
DROP POLICY IF EXISTS budgets_update_policy ON public.budgets;
DROP POLICY IF EXISTS budgets_delete_policy ON public.budgets;

ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY budgets_select_policy
ON public.budgets FOR SELECT TO authenticated
USING (
  (
    context = 'pf'
    AND company_id IS NULL
    AND user_id = auth.uid()
  )
  OR (
    context = 'pj'
    AND company_id IS NOT NULL
    AND private.member_permission(auth.uid(), company_id, 'budgets') IN ('view','edit')
  )
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY budgets_insert_policy
ON public.budgets FOR INSERT TO authenticated
WITH CHECK (
  (
    context = 'pf'
    AND company_id IS NULL
    AND user_id = auth.uid()
  )
  OR (
    context = 'pj'
    AND company_id IS NOT NULL
    AND user_id = auth.uid()
    AND private.member_permission(auth.uid(), company_id, 'budgets') = 'edit'
  )
);

CREATE POLICY budgets_update_policy
ON public.budgets FOR UPDATE TO authenticated
USING (
  (
    context = 'pf'
    AND company_id IS NULL
    AND user_id = auth.uid()
  )
  OR (
    context = 'pj'
    AND company_id IS NOT NULL
    AND private.member_permission(auth.uid(), company_id, 'budgets') = 'edit'
  )
)
WITH CHECK (
  -- Não pode trocar de tenant nem de contexto nem de dono
  (
    context = 'pf'
    AND company_id IS NULL
    AND user_id = auth.uid()
  )
  OR (
    context = 'pj'
    AND company_id IS NOT NULL
    AND private.member_permission(auth.uid(), company_id, 'budgets') = 'edit'
  )
);

CREATE POLICY budgets_delete_policy
ON public.budgets FOR DELETE TO authenticated
USING (
  (
    context = 'pf'
    AND company_id IS NULL
    AND user_id = auth.uid()
  )
  OR (
    context = 'pj'
    AND company_id IS NOT NULL
    AND private.member_permission(auth.uid(), company_id, 'budgets') = 'edit'
  )
);
