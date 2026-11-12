CREATE OR REPLACE FUNCTION public.app_error_log_record(_fingerprint text, _message text, _company_id uuid DEFAULT NULL::uuid, _surface text DEFAULT NULL::text, _route text DEFAULT NULL::text, _action text DEFAULT NULL::text, _severity text DEFAULT 'error'::text, _source text DEFAULT 'client'::text, _code text DEFAULT NULL::text, _user_message text DEFAULT NULL::text, _details jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_name text;
  v_email text;
  v_company uuid;
  v_ids uuid[];
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  v_company := _company_id;
  IF v_company IS NOT NULL AND auth.uid() IS NOT NULL THEN
    IF NOT (
      EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = v_company AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_company AND c.user_id = auth.uid())
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
    ) THEN
      v_company := NULL;
    END IF;
  END IF;

  -- Sem empresa informada (ex.: portal do colaborador): usa a única empresa
  -- do vínculo da pessoa. Com mais de uma empresa possível, fica sem empresa.
  IF v_company IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT array_agg(DISTINCT c.company_id) INTO v_ids
      FROM public.dp_colaboradores c WHERE c.user_id = auth.uid() AND c.company_id IS NOT NULL;
    IF coalesce(array_length(v_ids, 1), 0) = 1 THEN
      v_company := v_ids[1];
    ELSE
      SELECT array_agg(DISTINCT m.company_id) INTO v_ids
        FROM public.company_members m WHERE m.user_id = auth.uid();
      IF coalesce(array_length(v_ids, 1), 0) = 1 THEN
        v_company := v_ids[1];
      END IF;
    END IF;
  END IF;

  INSERT INTO public.app_error_logs (
    fingerprint, company_id, user_id, user_name, user_email, surface, route, action,
    severity, source, code, message, user_message, details
  ) VALUES (
    _fingerprint, v_company, auth.uid(), v_name, v_email, _surface, _route, _action,
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
    v_id, v_company, auth.uid(), v_name, v_email, _route, _code, _message, _details
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

-- Erros antigos do portal sem empresa: vincula quando a pessoa tem uma única empresa.
WITH alvo AS (
  SELECT l.id, l.fingerprint, (array_agg(DISTINCT c.company_id))[1] AS company_id
    FROM public.app_error_logs l
    JOIN public.dp_colaboradores c ON c.user_id = l.user_id AND c.company_id IS NOT NULL
   WHERE l.company_id IS NULL AND l.user_id IS NOT NULL
   GROUP BY l.id, l.fingerprint
  HAVING count(DISTINCT c.company_id) = 1
), livre AS (
  SELECT a.* FROM alvo a
   WHERE NOT EXISTS (
     SELECT 1 FROM public.app_error_logs x
      WHERE x.fingerprint = a.fingerprint AND x.company_id = a.company_id
   )
), upd AS (
  UPDATE public.app_error_logs l SET company_id = livre.company_id
    FROM livre WHERE l.id = livre.id
  RETURNING l.id, l.company_id
)
UPDATE public.app_error_occurrences o SET company_id = upd.company_id
  FROM upd WHERE o.error_log_id = upd.id AND o.company_id IS NULL;