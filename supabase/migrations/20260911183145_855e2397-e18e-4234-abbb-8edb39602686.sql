CREATE OR REPLACE FUNCTION private.dp_refresh_document_pending_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.id FROM public.companies c ORDER BY c.created_at NULLS LAST, c.id LOOP
    BEGIN
      PERFORM private.dp_refresh_document_pending(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'dp_refresh_document_pending falhou para empresa %: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$function$;

SELECT cron.unschedule('dp-refresh-document-pending-daily-3h-saopaulo');

SELECT cron.schedule(
  'dp-refresh-document-pending-daily-3h-saopaulo',
  '0 6 * * *',
  $$ SELECT private.dp_refresh_document_pending_queue(); $$
);