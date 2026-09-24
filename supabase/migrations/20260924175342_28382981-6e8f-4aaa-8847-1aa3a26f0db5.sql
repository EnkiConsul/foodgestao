ALTER TABLE public.company_invites ADD COLUMN IF NOT EXISTS grupo_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_company_invites_grupo_id ON public.company_invites(grupo_id);

CREATE OR REPLACE FUNCTION public.resolve_login_identifier(_identifier text)
 RETURNS TABLE(email text, source text, user_id uuid)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _clean text; _digits text; _found boolean := false;
BEGIN
  _clean := lower(btrim(coalesce(_identifier, '')));
  IF _clean = '' THEN RETURN; END IF;

  IF position('@' IN _clean) > 0 THEN
    RETURN QUERY SELECT u.email::text, 'email'::text, u.id FROM auth.users u WHERE lower(u.email) = _clean LIMIT 1;
    RETURN;
  END IF;

  _digits := regexp_replace(_clean, '\D', '', 'g');
  IF length(_digits) = 13 AND left(_digits, 2) = '55' THEN _digits := substr(_digits, 3); END IF;

  IF length(_digits) = 11 THEN
    RETURN QUERY
      SELECT ('cpf' || _digits || '@portal.360food.local')::text, 'cpf'::text, c.user_id
      FROM public.dp_colaboradores c
      WHERE c.cpf = _digits AND c.user_id IS NOT NULL AND coalesce(c.ativo, true) = true
      LIMIT 1;
    GET DIAGNOSTICS _found = ROW_COUNT;
    IF _found THEN RETURN; END IF;
  END IF;

  IF length(_digits) IN (10, 11) THEN
    RETURN QUERY
      SELECT u.email::text, 'whatsapp'::text, u.id FROM auth.users u
      WHERE lower(u.email) = 'wa' || _digits || '@usuarios.aveto360.local'
      LIMIT 1;
  END IF;
END;
$function$;
