ALTER TABLE public.app_error_reports ADD COLUMN IF NOT EXISTS reporter_email text;

CREATE OR REPLACE FUNCTION public.app_error_report_create(_error_log_id uuid, _description text, _attempted_action text DEFAULT NULL::text, _route text DEFAULT NULL::text)
RETURNS TABLE(id uuid, protocol text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_name text;
  v_email text;
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
  FROM public.app_error_logs AS e
  WHERE e.id = _error_log_id;

  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Erro não encontrado ou sem empresa vinculada'; END IF;
  IF NOT public.has_role(auth.uid(), 'super_admin') AND NOT EXISTS (
    SELECT 1 FROM public.company_members AS m
    WHERE m.company_id = v_company_id AND m.user_id = auth.uid()
  ) THEN RAISE EXCEPTION 'Sem acesso a esta empresa'; END IF;

  SELECT p.full_name INTO v_name FROM public.profiles AS p WHERE p.id = auth.uid();
  SELECT u.email INTO v_email FROM auth.users AS u WHERE u.id = auth.uid();
  v_protocol := 'ERR-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.app_error_reports AS created_report (
    error_log_id, company_id, reporter_user_id, reporter_name, reporter_email, protocol,
    description, attempted_action, route
  ) VALUES (
    _error_log_id, v_company_id, auth.uid(), v_name, v_email, v_protocol,
    v_description, v_attempted, left(_route, 500)
  ) RETURNING created_report.id INTO v_id;

  RETURN QUERY SELECT v_id AS id, v_protocol AS protocol;
END;
$function$;