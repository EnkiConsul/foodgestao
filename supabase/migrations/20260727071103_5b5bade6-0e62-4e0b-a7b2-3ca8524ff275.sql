
CREATE OR REPLACE FUNCTION public.run_balance_drift_scan()
RETURNS TABLE(scan_id uuid, drift_count integer, scanned_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scan_id uuid := gen_random_uuid();
  _now timestamptz := now();
  _count integer := 0;
  _caller uuid := auth.uid();
  _claims_role text := (current_setting('request.jwt.claims', true)::jsonb->>'role');
BEGIN
  -- Autorização: super_admin (usuário) OU service_role/cron (sem JWT).
  IF _caller IS NOT NULL THEN
    IF NOT public.has_role(_caller, 'super_admin') THEN
      RAISE EXCEPTION 'forbidden: super_admin required';
    END IF;
  ELSE
    -- Sem auth.uid(): aceita service_role via JWT ou execução direta (pg_cron/postgres).
    IF _claims_role IS NOT NULL AND _claims_role NOT IN ('service_role','postgres') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  INSERT INTO public.balance_drift_snapshots
    (scan_id, scanned_at, account_id, account_name, context, company_id,
     stored_balance, computed_balance, drift)
  SELECT
    _scan_id, _now, d.account_id, d.account_name, d.context, d.company_id,
    d.stored_balance, d.computed_balance, d.drift
  FROM public.report_balance_drift() d;

  GET DIAGNOSTICS _count = ROW_COUNT;

  RETURN QUERY SELECT _scan_id, _count, _now;
END $$;
