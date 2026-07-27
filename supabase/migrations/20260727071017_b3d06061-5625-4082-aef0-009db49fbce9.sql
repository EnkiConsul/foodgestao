
CREATE TABLE public.balance_drift_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id uuid NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  account_name text NOT NULL,
  context public.context_type NOT NULL,
  company_id uuid,
  stored_balance numeric NOT NULL,
  computed_balance numeric NOT NULL,
  drift numeric NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bds_scan_id ON public.balance_drift_snapshots(scan_id);
CREATE INDEX idx_bds_scanned_at ON public.balance_drift_snapshots(scanned_at DESC);
CREATE INDEX idx_bds_account_id ON public.balance_drift_snapshots(account_id);
CREATE INDEX idx_bds_unresolved ON public.balance_drift_snapshots(scanned_at DESC) WHERE resolved_at IS NULL;

GRANT SELECT, UPDATE ON public.balance_drift_snapshots TO authenticated;
GRANT ALL ON public.balance_drift_snapshots TO service_role;

ALTER TABLE public.balance_drift_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admins read drift"
  ON public.balance_drift_snapshots FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "super_admins update drift"
  ON public.balance_drift_snapshots FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Função de varredura. Chamada por cron (service_role) ou manualmente por super_admin.
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
  _is_service boolean := (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'service_role';
BEGIN
  IF _caller IS NULL AND NOT _is_service THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF _caller IS NOT NULL AND NOT public.has_role(_caller, 'super_admin') AND NOT _is_service THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
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

REVOKE ALL ON FUNCTION public.run_balance_drift_scan() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.run_balance_drift_scan() TO authenticated, service_role;

-- Marcar como resolvido
CREATE OR REPLACE FUNCTION public.resolve_balance_drift(_snapshot_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'forbidden: super_admin required';
  END IF;
  UPDATE public.balance_drift_snapshots
     SET resolved_at = now(),
         resolved_by = auth.uid(),
         resolution_note = _note
   WHERE id = _snapshot_id AND resolved_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.resolve_balance_drift(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_balance_drift(uuid, text) TO authenticated;
