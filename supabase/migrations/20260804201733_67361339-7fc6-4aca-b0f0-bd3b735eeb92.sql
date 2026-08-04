DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT ca.id, ca.user_id, ca.context, substring(ca.code from 5) AS newcode
    FROM public.chart_accounts ca
    WHERE ca.parent_id IS NULL
      AND ca.code ~ '^LEG\.[1-8]$'
      AND EXISTS (
        SELECT 1 FROM public.chart_accounts c2
        WHERE c2.parent_id = ca.id AND c2.code ~ '^[0-9]'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.chart_accounts c3
        WHERE c3.user_id = ca.user_id AND c3.context = ca.context
          AND c3.code = substring(ca.code from 5)
      )
  LOOP
    UPDATE public.chart_accounts
    SET code = r.newcode, updated_at = now()
    WHERE id = r.id;
  END LOOP;
END $$;