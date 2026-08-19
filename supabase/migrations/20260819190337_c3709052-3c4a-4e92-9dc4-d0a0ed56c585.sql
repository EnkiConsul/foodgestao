DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'audit_logs%' AND c.relkind IN ('r','p')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(_action text, _entity_type text, _entity_id text DEFAULT NULL::text, _details jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT full_name INTO _user_name FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.audit_logs (user_id, user_name, action, entity_type, entity_id, details)
  VALUES (auth.uid(), _user_name, _action, _entity_type, _entity_id, _details);
END;
$function$;

REVOKE ALL ON FUNCTION public.insert_audit_log(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, jsonb) TO authenticated, service_role;