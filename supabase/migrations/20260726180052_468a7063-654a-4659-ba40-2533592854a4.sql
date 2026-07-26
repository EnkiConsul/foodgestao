-- Bloco 8: Realtime for Open Finance tables
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'open_finance_connections'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.open_finance_connections;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'open_finance_sync_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.open_finance_sync_runs;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'open_finance_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.open_finance_accounts;
  END IF;
END $$;

-- Ensure REPLICA IDENTITY FULL so UPDATE events include full row (status transitions, saldos)
ALTER TABLE public.open_finance_connections REPLICA IDENTITY FULL;
ALTER TABLE public.open_finance_sync_runs REPLICA IDENTITY FULL;
ALTER TABLE public.open_finance_accounts REPLICA IDENTITY FULL;

-- Enable required extensions for cron dispatch
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;