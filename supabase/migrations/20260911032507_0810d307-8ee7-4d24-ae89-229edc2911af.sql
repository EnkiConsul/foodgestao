SELECT cron.unschedule('dp-refresh-document-pending-6-14-22-saopaulo');

SELECT cron.schedule(
  'dp-refresh-document-pending-daily-3h-saopaulo',
  '0 6 * * *',
  $cron$ SELECT private.dp_refresh_document_pending(NULL); $cron$
);