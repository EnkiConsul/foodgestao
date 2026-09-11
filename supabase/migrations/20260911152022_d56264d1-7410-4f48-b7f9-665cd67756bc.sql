ALTER TABLE public.app_error_logs ADD COLUMN IF NOT EXISTS user_email text;

CREATE TABLE IF NOT EXISTS public.app_error_occurrences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_log_id uuid NOT NULL REFERENCES public.app_error_logs(id) ON DELETE CASCADE,
  company_id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  route text,
  code text,
  message text,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_error_occurrences TO authenticated;
GRANT ALL ON public.app_error_occurrences TO service_role;

ALTER TABLE public.app_error_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_error_occurrences_select_company"
ON public.app_error_occurrences FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = app_error_occurrences.company_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (ARRAY['owner'::company_role, 'admin'::company_role])
  )
);

CREATE POLICY "app_error_occurrences_select_super"
ON public.app_error_occurrences FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS app_error_occurrences_log_idx
  ON public.app_error_occurrences (error_log_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.app_error_log_record(
  _fingerprint text,
  _message text,
  _company_id uuid DEFAULT NULL::uuid,
  _surface text DEFAULT NULL::text,
  _route text DEFAULT NULL::text,
  _action text DEFAULT NULL::text,
  _severity text DEFAULT 'error'::text,
  _source text DEFAULT 'client'::text,
  _code text DEFAULT NULL::text,
  _user_message text DEFAULT NULL::text,
  _details jsonb DEFAULT NULL::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_name text;
  v_email text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.app_error_logs (
    fingerprint, company_id, user_id, user_name, user_email, surface, route, action,
    severity, source, code, message, user_message, details
  ) VALUES (
    _fingerprint, _company_id, auth.uid(), v_name, v_email, _surface, _route, _action,
    coalesce(_severity, 'error'), coalesce(_source, 'client'), _code, _message, _user_message, _details
  )
  ON CONFLICT (fingerprint, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    occurrences = public.app_error_logs.occurrences + 1,
    last_seen_at = now(),
    message = excluded.message,
    code = coalesce(excluded.code, public.app_error_logs.code),
    user_message = coalesce(excluded.user_message, public.app_error_logs.user_message),
    details = coalesce(public.app_error_logs.details, '{}'::jsonb) || coalesce(excluded.details, '{}'::jsonb),
    route = coalesce(excluded.route, public.app_error_logs.route),
    action = coalesce(excluded.action, public.app_error_logs.action),
    user_id = coalesce(excluded.user_id, public.app_error_logs.user_id),
    user_name = coalesce(excluded.user_name, public.app_error_logs.user_name),
    user_email = coalesce(excluded.user_email, public.app_error_logs.user_email),
    status = CASE WHEN public.app_error_logs.status = 'resolvido' THEN 'aberto' ELSE public.app_error_logs.status END,
    updated_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.app_error_occurrences (
    error_log_id, company_id, user_id, user_name, user_email, route, code, message, details
  ) VALUES (
    v_id, _company_id, auth.uid(), v_name, v_email, _route, _code, _message, _details
  );

  DELETE FROM public.app_error_occurrences o
  WHERE o.error_log_id = v_id
    AND o.id NOT IN (
      SELECT k.id FROM public.app_error_occurrences k
      WHERE k.error_log_id = v_id
      ORDER BY k.created_at DESC
      LIMIT 20
    );

  RETURN v_id;
END;
$function$;