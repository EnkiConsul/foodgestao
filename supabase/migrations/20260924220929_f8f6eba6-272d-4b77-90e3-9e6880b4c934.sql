CREATE OR REPLACE FUNCTION public.pluggy_stale_connections(_horas integer DEFAULT 48)
RETURNS TABLE(id uuid, pluggy_item_id text, connector_name text, company_name text, status text, last_synced_at timestamptz, last_sync_status text, last_sync_error text, horas_parada numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.pluggy_item_id::text, c.connector_name::text, co.name::text, c.status::text,
         c.last_synced_at, c.last_sync_status::text, left(c.last_sync_error::text, 300),
         round(extract(epoch FROM now() - coalesce(c.last_synced_at, c.created_at)) / 3600, 1)
  FROM public.pluggy_connections c
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.status::text NOT IN ('deleted','revoked')
    AND c.revoked_at IS NULL
    AND coalesce(c.last_synced_at, c.created_at) < now() - make_interval(hours => greatest(_horas, 1))
  ORDER BY coalesce(c.last_synced_at, c.created_at);
END $$;
REVOKE ALL ON FUNCTION public.pluggy_stale_connections(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_stale_connections(integer) TO authenticated;