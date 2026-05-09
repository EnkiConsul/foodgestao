
-- Enable RLS on every existing partition of audit_logs
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_inherits inh
    JOIN pg_class p ON p.oid = inh.inhparent
    JOIN pg_class c ON c.oid = inh.inhrelid
    WHERE p.relname = 'audit_logs' AND p.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', rec.relname);
  END LOOP;
END $$;

-- Update partition manager to enable RLS on newly created partitions
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
  FOR i IN 0..3 LOOP
    start_d := date_trunc('month', current_date)::date + (i || ' month')::interval;
    end_d := start_d + interval '1 month';
    part_name := 'audit_logs_' || to_char(start_d, 'YYYY_MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_logs FOR VALUES FROM (%L) TO (%L)',
      part_name, start_d, end_d
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part_name);
  END LOOP;

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
