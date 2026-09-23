CREATE OR REPLACE FUNCTION public.pluggy_pending_manual_links(_dias integer DEFAULT 30)
RETURNS TABLE (
  pluggy_item_id text,
  connector_name text,
  ocorrencias integer,
  ultima_em timestamptz,
  motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dias integer := LEAST(GREATEST(COALESCE(_dias, 30), 1), 180);
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso restrito ao Backoffice.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH eventos AS (
    SELECT e.pluggy_item_id,
           count(*)::int AS ocorrencias,
           max(e.created_at) AS ultima_em
      FROM public.pluggy_webhook_events e
     WHERE e.error_code = 'pending_manual_link'
       AND e.pluggy_item_id IS NOT NULL
       AND e.created_at > now() - make_interval(days => v_dias)
     GROUP BY e.pluggy_item_id
  )
  SELECT ev.pluggy_item_id,
         c.connector_name,
         ev.ocorrencias,
         ev.ultima_em,
         (
           SELECT e2.error
             FROM public.pluggy_webhook_events e2
            WHERE e2.pluggy_item_id = ev.pluggy_item_id
              AND e2.error_code = 'pending_manual_link'
            ORDER BY e2.created_at DESC
            LIMIT 1
         ) AS motivo
    FROM eventos ev
    LEFT JOIN public.pluggy_connections c ON c.pluggy_item_id = ev.pluggy_item_id
   ORDER BY ev.ocorrencias DESC, ev.ultima_em DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_pending_manual_links(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_pending_manual_links(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_pending_manual_links(integer) TO service_role;
