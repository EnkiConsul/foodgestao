DROP POLICY IF EXISTS credit_cards_select ON public.credit_cards;
CREATE POLICY credit_cards_select ON public.credit_cards
FOR SELECT TO authenticated
USING (
  (company_id IS NULL AND (SELECT auth.uid()) = user_id)
  OR (company_id IS NOT NULL AND private.is_company_member((SELECT auth.uid()), company_id))
);

DROP POLICY IF EXISTS credit_cards_insert ON public.credit_cards;
CREATE POLICY credit_cards_insert ON public.credit_cards
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (
    company_id IS NULL
    OR private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'::text)
  )
);

DROP POLICY IF EXISTS credit_cards_update ON public.credit_cards;
CREATE POLICY credit_cards_update ON public.credit_cards
FOR UPDATE TO authenticated
USING (
  (company_id IS NULL AND (SELECT auth.uid()) = user_id)
  OR (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'::text))
)
WITH CHECK (
  (company_id IS NULL AND (SELECT auth.uid()) = user_id)
  OR (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'::text))
);

DROP POLICY IF EXISTS credit_cards_delete ON public.credit_cards;
CREATE POLICY credit_cards_delete ON public.credit_cards
FOR DELETE TO authenticated
USING (
  (company_id IS NULL AND (SELECT auth.uid()) = user_id)
  OR (company_id IS NOT NULL AND private.member_can_edit((SELECT auth.uid()), company_id, 'transactions'::text))
);