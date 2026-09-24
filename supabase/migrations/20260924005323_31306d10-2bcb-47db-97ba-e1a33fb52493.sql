SELECT cron.unschedule('dp-folga-autoatribuicao-diaria');

SELECT cron.schedule(
  'dp-folga-autoatribuicao-lotes',
  '35 * * * *',
  $$ SELECT public.dp_folga_autoatribuir_todas(2); $$
);