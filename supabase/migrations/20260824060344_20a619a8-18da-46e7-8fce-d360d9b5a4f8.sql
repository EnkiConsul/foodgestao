CREATE UNIQUE INDEX IF NOT EXISTS pluggy_connections_company_connector_active_idx
  ON public.pluggy_connections (company_id, connector_id)
  WHERE status <> 'deleted' AND connector_id IS NOT NULL;