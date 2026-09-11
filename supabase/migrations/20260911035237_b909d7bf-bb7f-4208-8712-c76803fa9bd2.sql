CREATE TABLE public.app_error_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_log_id uuid NOT NULL REFERENCES public.app_error_logs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL,
  reporter_name text,
  protocol text NOT NULL UNIQUE,
  description text NOT NULL,
  attempted_action text,
  route text,
  status text NOT NULL DEFAULT 'aberto',
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_error_reports_description_chk CHECK (char_length(btrim(description)) BETWEEN 10 AND 4000),
  CONSTRAINT app_error_reports_attempted_action_chk CHECK (attempted_action IS NULL OR char_length(attempted_action) <= 2000),
  CONSTRAINT app_error_reports_status_chk CHECK (status IN ('aberto','em_analise','resolvido','ignorado'))
);

GRANT SELECT ON public.app_error_reports TO authenticated;
GRANT ALL ON public.app_error_reports TO service_role;

ALTER TABLE public.app_error_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX app_error_reports_error_idx ON public.app_error_reports (error_log_id, created_at DESC);
CREATE INDEX app_error_reports_company_status_idx ON public.app_error_reports (company_id, status, created_at DESC);
CREATE INDEX app_error_reports_reporter_idx ON public.app_error_reports (reporter_user_id, created_at DESC);

CREATE POLICY app_error_reports_select_own
ON public.app_error_reports FOR SELECT TO authenticated
USING (reporter_user_id = auth.uid());

CREATE POLICY app_error_reports_select_company_admin
ON public.app_error_reports FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = app_error_reports.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

CREATE POLICY app_error_reports_update_company_admin
ON public.app_error_reports FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = app_error_reports.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin')
  OR EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = app_error_reports.company_id
      AND m.user_id = auth.uid()
      AND m.role IN ('owner','admin')
  )
);

CREATE TRIGGER app_error_reports_touch
BEFORE UPDATE ON public.app_error_reports
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.app_error_report_create(
  _error_log_id uuid,
  _description text,
  _attempted_action text DEFAULT NULL,
  _route text DEFAULT NULL
)
RETURNS TABLE(id uuid, protocol text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_name text;
  v_id uuid;
  v_protocol text;
  v_description text := btrim(coalesce(_description, ''));
  v_attempted text := nullif(btrim(coalesce(_attempted_action, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF char_length(v_description) < 10 OR char_length(v_description) > 4000 THEN
    RAISE EXCEPTION 'Descreva o problema entre 10 e 4000 caracteres';
  END IF;
  IF v_attempted IS NOT NULL AND char_length(v_attempted) > 2000 THEN
    RAISE EXCEPTION 'A ação tentada deve ter no máximo 2000 caracteres';
  END IF;

  SELECT e.company_id INTO v_company_id
  FROM public.app_error_logs e
  WHERE e.id = _error_log_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Erro não encontrado ou sem empresa vinculada'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = v_company_id AND m.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Sem acesso a esta empresa'; END IF;

  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  v_protocol := 'ERR-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.app_error_reports (
    error_log_id, company_id, reporter_user_id, reporter_name, protocol,
    description, attempted_action, route
  ) VALUES (
    _error_log_id, v_company_id, auth.uid(), v_name, v_protocol,
    v_description, v_attempted, left(_route, 500)
  ) RETURNING app_error_reports.id INTO v_id;

  RETURN QUERY SELECT v_id, v_protocol;
END;
$$;

CREATE OR REPLACE FUNCTION public.app_error_report_update_status(
  _report_id uuid,
  _status text,
  _internal_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação necessária'; END IF;
  IF _status NOT IN ('aberto','em_analise','resolvido','ignorado') THEN RAISE EXCEPTION 'Situação inválida'; END IF;

  SELECT company_id INTO v_company_id FROM public.app_error_reports WHERE id = _report_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Chamado não encontrado'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.company_members m
    WHERE m.company_id = v_company_id AND m.user_id = auth.uid() AND m.role IN ('owner','admin')
  ) THEN RAISE EXCEPTION 'Sem permissão para atualizar este chamado'; END IF;

  UPDATE public.app_error_reports
  SET status = _status, internal_note = nullif(btrim(coalesce(_internal_note, '')), '')
  WHERE id = _report_id;
END;
$$;

REVOKE ALL ON FUNCTION public.app_error_report_create(uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_error_report_create(uuid,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.app_error_report_update_status(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_error_report_update_status(uuid,text,text) TO authenticated;