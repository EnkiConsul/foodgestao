CREATE OR REPLACE FUNCTION public.pluggy_v2_reconciliation()
RETURNS TABLE(
  pluggy_item_id text,
  v1_connection_id uuid,
  v2_connection_id uuid,
  v1_status text,
  v2_status text,
  v1_company_id uuid,
  v2_company_id uuid,
  v1_accounts_count bigint,
  v2_accounts_count bigint,
  v1_transactions_count bigint,
  v2_transactions_count bigint,
  v1_last_synced_at timestamptz,
  v2_last_synced_at timestamptz,
  divergences text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH v1 AS (
    SELECT
      c.pluggy_item_id::text AS pluggy_item_id,
      c.id AS connection_id,
      c.status::text AS status,
      c.company_id,
      c.last_synced_at,
      (SELECT count(*) FROM public.open_finance_accounts a WHERE a.connection_id = c.id) AS accounts_count,
      (SELECT count(*) FROM public.open_finance_transactions_raw t WHERE t.connection_id = c.id) AS transactions_count
    FROM public.open_finance_connections c
    WHERE c.pluggy_item_id IS NOT NULL
  ),
  v2 AS (
    SELECT
      c.pluggy_item_id::text AS pluggy_item_id,
      c.id AS connection_id,
      c.status::text AS status,
      c.company_id,
      c.last_sync_at AS last_synced_at,
      (SELECT count(*) FROM public.pluggy_v2_accounts a WHERE a.connection_id = c.id) AS accounts_count,
      (SELECT count(*) FROM public.pluggy_v2_transactions_raw t WHERE t.connection_id = c.id) AS transactions_count
    FROM public.pluggy_v2_connections c
    WHERE c.pluggy_item_id IS NOT NULL
  ),
  merged AS (
    SELECT
      COALESCE(v1.pluggy_item_id, v2.pluggy_item_id) AS pluggy_item_id,
      v1.connection_id AS v1_connection_id,
      v2.connection_id AS v2_connection_id,
      v1.status AS v1_status,
      v2.status AS v2_status,
      v1.company_id AS v1_company_id,
      v2.company_id AS v2_company_id,
      COALESCE(v1.accounts_count, 0) AS v1_accounts_count,
      COALESCE(v2.accounts_count, 0) AS v2_accounts_count,
      COALESCE(v1.transactions_count, 0) AS v1_transactions_count,
      COALESCE(v2.transactions_count, 0) AS v2_transactions_count,
      v1.last_synced_at AS v1_last_synced_at,
      v2.last_synced_at AS v2_last_synced_at
    FROM v1
    FULL OUTER JOIN v2 USING (pluggy_item_id)
  )
  SELECT
    m.*,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN m.v1_connection_id IS NULL THEN 'missing_in_v1' END,
      CASE WHEN m.v2_connection_id IS NULL THEN 'missing_in_v2' END,
      CASE WHEN m.v1_connection_id IS NOT NULL AND m.v2_connection_id IS NOT NULL
             AND m.v1_company_id IS DISTINCT FROM m.v2_company_id THEN 'company_mismatch' END,
      CASE WHEN m.v1_accounts_count <> m.v2_accounts_count AND m.v1_connection_id IS NOT NULL AND m.v2_connection_id IS NOT NULL THEN 'accounts_count_diff' END,
      CASE WHEN m.v1_transactions_count <> m.v2_transactions_count AND m.v1_connection_id IS NOT NULL AND m.v2_connection_id IS NOT NULL THEN 'transactions_count_diff' END
    ], NULL) AS divergences
  FROM merged m
  ORDER BY
    (CASE WHEN m.v1_connection_id IS NULL OR m.v2_connection_id IS NULL THEN 0 ELSE 1 END),
    m.pluggy_item_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_v2_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_v2_reconciliation() TO authenticated;