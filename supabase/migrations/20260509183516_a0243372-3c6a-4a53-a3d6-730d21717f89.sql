
-- Helper to (re)create the two RLS policies on a given audit_logs partition
CREATE OR REPLACE FUNCTION private.apply_audit_log_partition_policies(_part_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "Super admins can view audit logs" ON public.%I', _part_name);
  EXECUTE format('DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.%I', _part_name);
  EXECUTE format(
    'CREATE POLICY "Super admins can view audit logs" ON public.%I FOR SELECT USING (public.is_super_admin(auth.uid()))',
    _part_name
  );
  EXECUTE format(
    'CREATE POLICY "Users can insert own audit logs" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
    _part_name
  );
END;
$$;

REVOKE ALL ON FUNCTION private.apply_audit_log_partition_policies(text) FROM PUBLIC, anon, authenticated;

-- Apply to all existing partitions
DO $$
DECLARE rec record;
BEGIN
  FOR rec IN
    SELECT c.relname
    FROM pg_inherits inh
    JOIN pg_class p ON p.oid = inh.inhparent
    JOIN pg_class c ON c.oid = inh.inhrelid
    WHERE p.relname = 'audit_logs' AND p.relnamespace = 'public'::regnamespace
  LOOP
    PERFORM private.apply_audit_log_partition_policies(rec.relname);
  END LOOP;
END $$;

-- Update partition manager to also apply policies on newly created partitions
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
    PERFORM private.apply_audit_log_partition_policies(part_name);
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
