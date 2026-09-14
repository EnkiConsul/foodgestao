-- 1) Verificação central de bloqueio
CREATE OR REPLACE FUNCTION private.dp_access_enabled(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND NOT COALESCE(
    (SELECT s.access_blocked FROM public.auth_user_security_state s WHERE s.user_id = _user_id),
    false
  );
$function$;

REVOKE ALL ON FUNCTION private.dp_access_enabled(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.dp_access_enabled(uuid) TO authenticated, service_role;

-- 2) Auxiliares de acesso passam a negar usuário bloqueado
CREATE OR REPLACE FUNCTION private.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.dp_access_enabled(_user_id)
     AND EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id)
$function$;

CREATE OR REPLACE FUNCTION private.is_company_admin_or_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.dp_access_enabled(_user_id)
     AND EXISTS (SELECT 1 FROM public.company_members WHERE user_id = _user_id AND company_id = _company_id AND role IN ('owner','admin'))
$function$;

CREATE OR REPLACE FUNCTION public.is_company_admin_or_owner(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.dp_access_enabled(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.company_members
       WHERE user_id = _user_id
         AND company_id = _company_id
         AND role IN ('owner','admin')
     )
$function$;

CREATE OR REPLACE FUNCTION private.is_dp_colaborador_of_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.dp_access_enabled(_user_id)
     AND EXISTS (
       SELECT 1 FROM public.dp_colaboradores c
       WHERE c.user_id = _user_id
         AND c.company_id = _company_id
         AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
     );
$function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    WHERE private.dp_access_enabled(_user_id)
      AND (c.ativo = true OR (c.acesso_portal_ate IS NOT NULL AND c.acesso_portal_ate >= CURRENT_DATE))
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos
  WHERE (SELECT count(*) FROM candidatos) = 1;
$function$;

CREATE OR REPLACE FUNCTION public.dp_colaborador_ativo_of(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH candidatos AS (
    SELECT c.id
    FROM public.dp_colaboradores c
    WHERE private.dp_access_enabled(_user_id)
      AND c.ativo = true
      AND c.user_id = _user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.companies co
        WHERE co.id = c.company_id AND co.user_id = _user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.company_members m
        WHERE m.company_id = c.company_id
          AND m.user_id = _user_id
          AND m.role IN ('owner','admin')
      )
    LIMIT 2
  )
  SELECT id FROM candidatos
  WHERE (SELECT count(*) FROM candidatos) = 1;
$function$;

-- 3) Reserva do link de uso único
ALTER TABLE public.dp_portal_access_tokens
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.dp_portal_token_claim(
  p_token_id uuid,
  p_token_hash text,
  p_purpose text
)
RETURNS TABLE(user_id uuid, colaborador_id uuid, company_id uuid, purpose text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_colab uuid;
  v_company uuid;
  v_purpose text;
BEGIN
  UPDATE public.dp_portal_access_tokens t
     SET claimed_at = now(),
         claim_expires_at = now() + interval '2 minutes',
         updated_at = now()
   WHERE t.id = p_token_id
     AND t.token_hash = p_token_hash
     AND t.purpose = p_purpose
     AND t.consumed_at IS NULL
     AND t.expires_at > now()
     AND (t.claim_expires_at IS NULL OR t.claim_expires_at < now())
  RETURNING t.user_id, t.colaborador_id, t.company_id, t.purpose
       INTO v_user, v_colab, v_company, v_purpose;

  IF v_user IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_user, v_colab, v_company, v_purpose;
END;
$function$;

CREATE OR REPLACE FUNCTION public.dp_portal_token_confirm(p_token_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.dp_portal_access_tokens
       SET consumed_at = now(), updated_at = now()
     WHERE id = p_token_id AND consumed_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

CREATE OR REPLACE FUNCTION public.dp_portal_token_release(p_token_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH upd AS (
    UPDATE public.dp_portal_access_tokens
       SET claimed_at = NULL, claim_expires_at = NULL, updated_at = now()
     WHERE id = p_token_id AND consumed_at IS NULL
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_token_claim(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_portal_token_confirm(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_portal_token_release(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dp_portal_token_claim(uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_portal_token_confirm(uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_portal_token_release(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dp_portal_token_claim(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_portal_token_confirm(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.dp_portal_token_release(uuid) TO service_role;