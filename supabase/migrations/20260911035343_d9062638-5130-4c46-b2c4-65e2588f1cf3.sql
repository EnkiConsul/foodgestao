CREATE TABLE public.app_error_report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.app_error_reports(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_error_report_events_type_chk CHECK (event_type IN ('criado','status_alterado'))
);

GRANT SELECT, INSERT ON public.app_error_report_events TO authenticated;
GRANT ALL ON public.app_error_report_events TO service_role;

ALTER TABLE public.app_error_report_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX app_error_report_events_report_idx ON public.app_error_report_events (report_id, created_at);

CREATE POLICY app_error_report_events_select_allowed
ON public.app_error_report_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.app_error_reports r
    WHERE r.id = app_error_report_events.report_id
      AND (
        r.reporter_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members m
          WHERE m.company_id = r.company_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner','admin')
        )
      )
  )
);

CREATE POLICY app_error_report_events_insert_allowed
ON public.app_error_report_events FOR INSERT TO authenticated
WITH CHECK (
  actor_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.app_error_reports r
    WHERE r.id = app_error_report_events.report_id
      AND r.company_id = app_error_report_events.company_id
      AND (
        r.reporter_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'super_admin')
        OR EXISTS (
          SELECT 1 FROM public.company_members m
          WHERE m.company_id = r.company_id
            AND m.user_id = auth.uid()
            AND m.role IN ('owner','admin')
        )
      )
  )
);

CREATE OR REPLACE FUNCTION public.app_error_report_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.app_error_report_events (
      report_id, company_id, actor_user_id, event_type, to_status
    ) VALUES (NEW.id, NEW.company_id, auth.uid(), 'criado', NEW.status);
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.internal_note IS DISTINCT FROM OLD.internal_note THEN
    INSERT INTO public.app_error_report_events (
      report_id, company_id, actor_user_id, event_type, from_status, to_status, note
    ) VALUES (NEW.id, NEW.company_id, auth.uid(), 'status_alterado', OLD.status, NEW.status, NEW.internal_note);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER app_error_report_audit_trigger
AFTER INSERT OR UPDATE OF status, internal_note ON public.app_error_reports
FOR EACH ROW EXECUTE FUNCTION public.app_error_report_audit();