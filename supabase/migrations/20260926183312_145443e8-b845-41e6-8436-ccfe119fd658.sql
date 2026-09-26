CREATE OR REPLACE FUNCTION public.pluggy_connection_in_cooldown(_item_id text, _cooldown_minutes integer DEFAULT 15)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.pluggy_connections c
     WHERE c.pluggy_item_id = _item_id
       AND c.last_synced_at IS NOT NULL
       AND c.last_synced_at > now() - make_interval(mins => GREATEST(COALESCE(_cooldown_minutes, 15), 1))
  );
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_reap_stale_sync_runs(_timeout_minutes integer DEFAULT 15)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- A tabela de execuções V2 foi removida; a V1 não mantém execuções a liberar.
  RETURN 0;
END;
$function$;