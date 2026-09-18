-- P0 Open Finance (parte 3): cliente sem escrita direta nas tabelas da integração.
-- Leitura empresarial preservada; service_role intacto.
-- Rollback: GRANT INSERT, UPDATE, DELETE nas tabelas para authenticated e recriar
-- as policies de escrita removidas abaixo.

DO $$
DECLARE
  t text;
  r text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pluggy_connections',
    'pluggy_connect_requests',
    'pluggy_accounts',
    'pluggy_staging_transactions',
    'pluggy_v2_connections',
    'pluggy_v2_accounts',
    'pluggy_v2_sync_runs',
    'pluggy_v2_transactions_raw'
  ] LOOP
    FOREACH r IN ARRAY ARRAY['PUBLIC', 'anon', 'authenticated'] LOOP
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON TABLE public.%I FROM %s', t, r);
      -- privilégios de coluna, se existirem
      FOR c IN
        SELECT attname FROM pg_attribute
         WHERE attrelid = format('public.%I', t)::regclass
           AND attnum > 0 AND NOT attisdropped
      LOOP
        EXECUTE format('REVOKE INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM %s', c, c, c, t, r);
      END LOOP;
    END LOOP;
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Policies de escrita do cliente que deixaram de ter consumidor
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'pluggy_connections', 'pluggy_connect_requests', 'pluggy_accounts',
         'pluggy_staging_transactions', 'pluggy_v2_connections', 'pluggy_v2_accounts',
         'pluggy_v2_sync_runs', 'pluggy_v2_transactions_raw'
       )
       AND permissive = 'PERMISSIVE'
       AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
       AND 'authenticated' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;