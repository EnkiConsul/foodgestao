GRANT INSERT ON public.app_error_reports TO authenticated;

CREATE POLICY app_error_reports_insert_own
ON public.app_error_reports FOR INSERT TO authenticated
WITH CHECK (
  reporter_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.app_error_logs e
    WHERE e.id = app_error_reports.error_log_id
      AND e.company_id = app_error_reports.company_id
  )
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = app_error_reports.company_id
        AND m.user_id = auth.uid()
    )
  )
);

ALTER FUNCTION public.app_error_report_create(uuid,text,text,text) SECURITY INVOKER;
ALTER FUNCTION public.app_error_report_update_status(uuid,text,text) SECURITY INVOKER;