DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('accounts','accounts'),('transactions','transactions'),('credit_cards','credit_cards')) v(t,item)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=r.t AND column_name='company_id') THEN
      EXECUTE format('DROP POLICY IF EXISTS perm_matriz_delete_total ON public.%I', r.t);
      EXECUTE format('CREATE POLICY perm_matriz_delete_total ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (company_id IS NULL OR public.is_super_admin(auth.uid()) OR public.tem_permissao(company_id, %L, ''total''))', r.t, r.item);
    END IF;
  END LOOP;
END $$;