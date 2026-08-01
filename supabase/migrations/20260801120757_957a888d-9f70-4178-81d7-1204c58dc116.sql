-- Fase 1.2 — RLS initplan optimization: auth.uid() -> (select auth.uid())
-- Semanticamente idêntico; muda apenas o plano de execução (1 avaliação por query
-- em vez de 1 por linha).
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  stmt text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual LIKE '%auth.uid()%' AND qual NOT LIKE '%SELECT auth.uid()%')
        OR (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%SELECT auth.uid()%')
      )
  LOOP
    new_qual := CASE
      WHEN r.qual IS NULL THEN NULL
      ELSE replace(r.qual, 'auth.uid()', '(SELECT auth.uid())')
    END;
    new_check := CASE
      WHEN r.with_check IS NULL THEN NULL
      ELSE replace(r.with_check, 'auth.uid()', '(SELECT auth.uid())')
    END;

    -- evita aninhar quando parte da expressão já estava otimizada
    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, '( SELECT (SELECT auth.uid()) AS uid)', '( SELECT auth.uid() AS uid)');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, '( SELECT (SELECT auth.uid()) AS uid)', '( SELECT auth.uid() AS uid)');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE stmt;
    n := n + 1;
  END LOOP;

  RAISE NOTICE 'Políticas RLS otimizadas: %', n;
END $$;
