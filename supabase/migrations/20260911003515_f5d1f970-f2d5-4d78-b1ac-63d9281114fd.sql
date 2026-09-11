-- 1) Nome social no cadastro do colaborador
ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS nome_social text;

-- 2) Auditoria de erros do sistema
CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid,
  user_name text,
  surface text,
  route text,
  action text,
  severity text NOT NULL DEFAULT 'error',
  source text NOT NULL DEFAULT 'client',
  code text,
  message text NOT NULL,
  user_message text,
  details jsonb,
  status text NOT NULL DEFAULT 'aberto',
  status_note text,
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_error_logs_severity_chk CHECK (severity IN ('error','warning','info')),
  CONSTRAINT app_error_logs_status_chk CHECK (status IN ('aberto','resolvido','ignorado')),
  CONSTRAINT app_error_logs_source_chk CHECK (source IN ('client','database','edge','import'))
);

CREATE UNIQUE INDEX IF NOT EXISTS app_error_logs_group_uniq
  ON public.app_error_logs (fingerprint, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS app_error_logs_last_seen_idx
  ON public.app_error_logs (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS app_error_logs_company_idx
  ON public.app_error_logs (company_id, status, last_seen_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.app_error_logs TO authenticated;
GRANT ALL ON public.app_error_logs TO service_role;

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_error_logs_select_super ON public.app_error_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY app_error_logs_select_company ON public.app_error_logs
  FOR SELECT TO authenticated
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = app_error_logs.company_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  );

CREATE POLICY app_error_logs_insert_any ON public.app_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY app_error_logs_update_super ON public.app_error_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY app_error_logs_update_company ON public.app_error_logs
  FOR UPDATE TO authenticated
  USING (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = app_error_logs.company_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  )
  WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.company_members m
      WHERE m.company_id = app_error_logs.company_id
        AND m.user_id = auth.uid()
        AND m.role IN ('owner','admin')
    )
  );

CREATE TRIGGER app_error_logs_touch
  BEFORE UPDATE ON public.app_error_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registro agrupado: mesma assinatura soma occurrences em vez de criar linha nova.
CREATE OR REPLACE FUNCTION public.app_error_log_record(
  _fingerprint text,
  _message text,
  _company_id uuid DEFAULT NULL,
  _surface text DEFAULT NULL,
  _route text DEFAULT NULL,
  _action text DEFAULT NULL,
  _severity text DEFAULT 'error',
  _source text DEFAULT 'client',
  _code text DEFAULT NULL,
  _user_message text DEFAULT NULL,
  _details jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.app_error_logs (
    fingerprint, company_id, user_id, user_name, surface, route, action,
    severity, source, code, message, user_message, details
  ) VALUES (
    _fingerprint, _company_id, auth.uid(), v_name, _surface, _route, _action,
    coalesce(_severity, 'error'), coalesce(_source, 'client'), _code, _message, _user_message, _details
  )
  ON CONFLICT (fingerprint, coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    occurrences = public.app_error_logs.occurrences + 1,
    last_seen_at = now(),
    message = excluded.message,
    user_message = coalesce(excluded.user_message, public.app_error_logs.user_message),
    details = coalesce(excluded.details, public.app_error_logs.details),
    route = coalesce(excluded.route, public.app_error_logs.route),
    action = coalesce(excluded.action, public.app_error_logs.action),
    user_id = coalesce(excluded.user_id, public.app_error_logs.user_id),
    user_name = coalesce(excluded.user_name, public.app_error_logs.user_name),
    status = CASE WHEN public.app_error_logs.status = 'resolvido' THEN 'aberto' ELSE public.app_error_logs.status END,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_error_log_record(text,text,uuid,text,text,text,text,text,text,text,jsonb) TO authenticated, service_role;