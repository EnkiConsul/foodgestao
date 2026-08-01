CREATE OR REPLACE FUNCTION public.system_health_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'generated_at', now(),
    'database', (
      SELECT jsonb_build_object(
        'size_bytes', pg_database_size(current_database()),
        'commits', d.xact_commit,
        'rollbacks', d.xact_rollback,
        'rollback_ratio', CASE WHEN (d.xact_commit + d.xact_rollback) > 0
          THEN round((d.xact_rollback::numeric / (d.xact_commit + d.xact_rollback)) * 100, 2) ELSE 0 END,
        'cache_hit_ratio', CASE WHEN (d.blks_hit + d.blks_read) > 0
          THEN round((d.blks_hit::numeric / (d.blks_hit + d.blks_read)) * 100, 2) ELSE 0 END,
        'deadlocks', d.deadlocks,
        'connections', d.numbackends
      )
      FROM pg_stat_database d WHERE d.datname = current_database()
    ),
    'tables', (
      SELECT coalesce(jsonb_agg(t ORDER BY (t->>'total_bytes')::bigint DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'name', c.relname,
          'live_rows', s.n_live_tup,
          'dead_rows', s.n_dead_tup,
          'total_bytes', pg_total_relation_size(c.oid),
          'seq_scan', s.seq_scan,
          'idx_scan', coalesce(s.idx_scan, 0)
        ) AS t
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 15
      ) q
    ),
    'unused_indexes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'index', indexrelname, 'table', relname, 'size_bytes', pg_relation_size(indexrelid)
      )), '[]'::jsonb)
      FROM pg_stat_user_indexes i
      WHERE i.schemaname = 'public' AND i.idx_scan = 0
        AND pg_relation_size(i.indexrelid) > 1024 * 512
    ),
    'volumes', jsonb_build_object(
      'usuarios', (SELECT count(*) FROM public.profiles),
      'empresas', (SELECT count(*) FROM public.companies),
      'lancamentos', (SELECT count(*) FROM public.transactions),
      'colaboradores', (SELECT count(*) FROM public.dp_colaboradores),
      'assinaturas_ativas', (SELECT count(*) FROM public.subscriptions WHERE status IN ('active','trialing'))
    ),
    'integracoes', jsonb_build_object(
      'pluggy_conexoes', (SELECT count(*) FROM public.pluggy_connections),
      'pluggy_erros', (SELECT count(*) FROM public.pluggy_connections WHERE status IN ('login_error','error')),
      'pluggy_webhooks_pendentes', (SELECT count(*) FROM public.pluggy_webhook_events WHERE status IN ('pending','processing')),
      'pluggy_webhooks_dead_letter', (SELECT count(*) FROM public.pluggy_webhook_events WHERE status = 'dead_letter'),
      'asaas_webhooks_24h', (SELECT count(*) FROM public.asaas_webhook_events WHERE created_at > now() - interval '24 hours')
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.system_health_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.system_health_snapshot() TO authenticated;