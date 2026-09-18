-- P0 Open Finance (parte 4): permissão por módulo explícita nos helpers do Open Finance.
-- Não altera private.member_permission (regra geral da plataforma permanece).
-- Rollback: restaurar pluggy_can_edit/pluggy_can_manage_accounts para usar
-- private.member_can_edit e remover private.pluggy_module_edit.

CREATE OR REPLACE FUNCTION private.pluggy_module_edit(_user_id uuid, _company_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(
    private.dp_access_enabled(_user_id)
    AND NOT private.is_company_accountant(_user_id, _company_id)
    AND (
      public.has_role(_user_id, 'super_admin')
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
         WHERE cm.user_id = _user_id
           AND cm.company_id = _company_id
           AND (
             cm.role IN ('owner', 'admin')
             OR (cm.role = 'member' AND cm.permissions->>_module = 'edit')
           )
      )
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION private.pluggy_can_edit(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(private.pluggy_module_edit(_user_id, _company_id, 'transactions'), false);
$function$;

CREATE OR REPLACE FUNCTION private.pluggy_can_manage_accounts(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(private.pluggy_module_edit(_user_id, _company_id, 'accounts'), false);
$function$;