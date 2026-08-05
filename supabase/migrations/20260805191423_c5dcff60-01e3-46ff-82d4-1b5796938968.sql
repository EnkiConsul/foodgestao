ALTER TABLE public.ped_units
  ADD COLUMN IF NOT EXISTS accept_deadline_minutes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS delay_tolerance_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS pickup_deadline_minutes integer NOT NULL DEFAULT 15;

ALTER TABLE public.ped_units
  DROP CONSTRAINT IF EXISTS ped_units_deadlines_chk;
ALTER TABLE public.ped_units
  ADD CONSTRAINT ped_units_deadlines_chk CHECK (
    accept_deadline_minutes BETWEEN 1 AND 120
    AND delay_tolerance_minutes BETWEEN 0 AND 240
    AND pickup_deadline_minutes BETWEEN 1 AND 240);

ALTER TABLE public.ped_orders REPLICA IDENTITY FULL;
ALTER TABLE public.ped_order_items REPLICA IDENTITY FULL;
ALTER TABLE public.ped_order_status_history REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ped_orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ped_orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ped_order_items') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ped_order_items;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ped_order_status_history') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ped_order_status_history;
  END IF;
END $$;