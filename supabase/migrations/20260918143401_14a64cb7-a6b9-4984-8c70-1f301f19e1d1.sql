-- P0 Open Finance: permissão específica no cancelamento de autorizações e
-- recusa de usuários bloqueados nos helpers de edição.
-- Rollback: restaurar as definições anteriores das três funções.

CREATE OR REPLACE FUNCTION private.pluggy_can_edit(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(
    private.dp_access_enabled(_user_id)
    AND (
      private.is_company_owner(_user_id, _company_id)
      OR private.member_can_edit(_user_id, _company_id, 'transactions')
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_user_can_edit(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(private.pluggy_can_edit(_user_id, _company_id), false)
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_cancel_connect_requests(_company_id uuid, _request_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_count integer;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Cancelar autorização é mutação do fluxo de conexão: exige dono ou permissão
  -- de edição e usuário não bloqueado. Nunca confia em user_id de parâmetro.
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.pluggy_connect_requests
     SET status = 'cancelled',
         completed_at = now(),
         updated_at = now()
   WHERE company_id = _company_id
     AND status = 'open'
     AND (_request_id IS NULL OR id = _request_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_cancel_connect_requests(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_cancel_connect_requests(uuid, uuid) TO authenticated;