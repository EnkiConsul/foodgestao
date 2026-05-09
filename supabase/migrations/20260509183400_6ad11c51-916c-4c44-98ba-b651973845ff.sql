
-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;

-- 2. Build new partitioned table alongside the old one
CREATE TABLE public.audit_logs_new (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Default partition catches stragglers
CREATE TABLE public.audit_logs_default PARTITION OF public.audit_logs_new DEFAULT;

-- Pre-create monthly partitions: last 12 months + current + next 3 months
DO $$
DECLARE
  i int;
  start_d date;
  end_d date;
  part_name text;
BEGIN
  FOR i IN -12..3 LOOP
    start_d := date_trunc('month', current_date)::date + (i || ' month')::interval;
    end_d := start_d + interval '1 month';
    part_name := 'audit_logs_' || to_char(start_d, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_logs_new FOR VALUES FROM (%L) TO (%L)',
      part_name, start_d, end_d
    );
  END LOOP;
END $$;

-- 3. Copy existing data
INSERT INTO public.audit_logs_new (id, user_id, user_name, action, entity_type, entity_id, details, created_at)
SELECT id, user_id, user_name, action, entity_type, entity_id, details, created_at
FROM public.audit_logs;

-- 4. Swap tables
DROP TABLE public.audit_logs CASCADE;
ALTER TABLE public.audit_logs_new RENAME TO audit_logs;

-- 5. Re-apply RLS, policies, indexes
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view audit logs" ON public.audit_logs
  FOR SELECT USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can insert own audit logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs (action, created_at DESC);

-- 6. Partition management function (private schema, not exposed)
CREATE OR REPLACE FUNCTION private.manage_audit_logs_partitions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i int;
  start_d date;
  end_d date;
  part_name text;
  cutoff date;
  rec record;
BEGIN
  -- Ensure next 3 monthly partitions exist
  FOR i IN 0..3 LOOP
    start_d := date_trunc('month', current_date)::date + (i || ' month')::interval;
    end_d := start_d + interval '1 month';
    part_name := 'audit_logs_' || to_char(start_d, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',
      part_name, start_d, end_d
    );
  END LOOP;

  -- Drop monthly partitions older than 12 months
  cutoff := (date_trunc('month', current_date) - interval '12 months')::date;
  FOR rec IN
    SELECT c.relname
    FROM pg_inherits inh
    JOIN pg_class p ON p.oid = inh.inhparent
    JOIN pg_class c ON c.oid = inh.inhrelid
    WHERE p.relname = 'audit_logs' AND p.relnamespace = 'public'::regnamespace
      AND c.relname ~ '^audit_logs_\d{4}_\d{2}$'
      AND to_date(substring(c.relname FROM 'audit_logs_(\d{4}_\d{2})'), 'YYYY_MM') < cutoff
  LOOP
    EXECUTE format('DROP TABLE public.%I', rec.relname);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.manage_audit_logs_partitions() FROM PUBLIC, anon, authenticated;

-- 7. Schedule monthly cron — 02:00 UTC on the 1st
SELECT cron.schedule(
  'manage-audit-logs-partitions',
  '0 2 1 * *',
  $cron$ SELECT private.manage_audit_logs_partitions(); $cron$
);
