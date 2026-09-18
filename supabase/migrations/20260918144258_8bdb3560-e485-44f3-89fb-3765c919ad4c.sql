-- P0 Open Finance (parte 2): permissão de contas separada + RPCs específicas
-- para as escritas que hoje partem do aplicativo.
-- Rollback: DROP das funções criadas e restaurar pluggy_cancel_connect_requests
-- para a versão que usa private.pluggy_can_edit.

-- 1. Permissão de gerenciamento de contas/conexões (accounts), distinta de conciliação (transactions)
CREATE OR REPLACE FUNCTION private.pluggy_can_manage_accounts(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(
    private.dp_access_enabled(_user_id)
    AND (
      private.is_company_owner(_user_id, _company_id)
      OR private.member_can_edit(_user_id, _company_id, 'accounts')
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_user_can_manage_accounts(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
  SELECT COALESCE(private.pluggy_can_manage_accounts(_user_id, _company_id), false)
$function$;

REVOKE ALL ON FUNCTION public.pluggy_user_can_manage_accounts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_user_can_manage_accounts(uuid, uuid) TO authenticated, service_role;

-- 2. Cancelamento de autorização é gestão de conexão -> permissão de contas
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

  IF NOT COALESCE(private.pluggy_can_manage_accounts(v_uid, _company_id), false) THEN
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

-- 3. Conciliação: limpar extrato pendente da empresa autorizada
CREATE OR REPLACE FUNCTION public.pluggy_clear_pending_staging(_company_id uuid, _connection_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.pluggy_staging_transactions
   WHERE company_id = _company_id
     AND status = 'pending'
     AND (_connection_id IS NULL OR connection_id = _connection_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid) TO authenticated;

-- 4. Conciliação: limpar sugestão de conta das linhas pendentes informadas
CREATE OR REPLACE FUNCTION public.pluggy_clear_staging_suggestions(_company_id uuid, _ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN RETURN 0; END IF;
  IF array_length(_ids, 1) > 5000 THEN RAISE EXCEPTION 'too_many_ids'; END IF;

  UPDATE public.pluggy_staging_transactions
     SET suggested_account_id = NULL,
         updated_at = now()
   WHERE company_id = _company_id
     AND status = 'pending'
     AND id = ANY(_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_clear_staging_suggestions(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_clear_staging_suggestions(uuid, uuid[]) TO authenticated;

-- 5. Conciliação: reprocessar nome/documento da contraparte (somente pendentes)
CREATE OR REPLACE FUNCTION public.pluggy_set_staging_counterparties(_company_id uuid, _items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'company_required'; END IF;
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN RAISE EXCEPTION 'invalid_items'; END IF;
  IF jsonb_array_length(_items) > 2000 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) e
     WHERE COALESCE(e->>'document_type', 'CPF') NOT IN ('CPF', 'CNPJ')
  ) THEN
    RAISE EXCEPTION 'invalid_document_type';
  END IF;

  WITH payload AS (
    SELECT (e->>'id')::uuid AS id,
           NULLIF(btrim(COALESCE(e->>'name', '')), '') AS name,
           NULLIF(regexp_replace(COALESCE(e->>'document', ''), '\D', '', 'g'), '') AS document,
           NULLIF(e->>'document_type', '') AS document_type
      FROM jsonb_array_elements(_items) e
  ), upd AS (
    UPDATE public.pluggy_staging_transactions s
       SET counterparty_name = p.name,
           counterparty_document = p.document,
           counterparty_document_type = p.document_type,
           updated_at = now()
      FROM payload p
     WHERE s.id = p.id
       AND s.company_id = _company_id
       AND s.status = 'pending'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_set_staging_counterparties(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_set_staging_counterparties(uuid, jsonb) TO authenticated;

-- 6. Conciliação: editar a descrição de um lançamento pendente
CREATE OR REPLACE FUNCTION public.pluggy_set_staging_description(_company_id uuid, _id uuid, _description text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
  v_desc text := btrim(COALESCE(_description, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _company_id IS NULL OR _id IS NULL THEN RAISE EXCEPTION 'invalid_arguments'; END IF;
  IF NOT COALESCE(private.pluggy_can_edit(v_uid, _company_id), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_desc = '' THEN RAISE EXCEPTION 'description_required'; END IF;
  IF length(v_desc) > 300 THEN RAISE EXCEPTION 'description_too_long'; END IF;

  UPDATE public.pluggy_staging_transactions
     SET description = v_desc,
         updated_at = now()
   WHERE id = _id
     AND company_id = _company_id
     AND status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN RAISE EXCEPTION 'staging_not_editable'; END IF;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_set_staging_description(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_set_staging_description(uuid, uuid, text) TO authenticated;

-- 7. Revisão de cartão do Open Finance (vincular / ignorar)
CREATE OR REPLACE FUNCTION public.pluggy_review_credit_account(
  _account_id uuid,
  _status text,
  _credit_card_id uuid DEFAULT NULL::uuid,
  _name text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_name text := NULLIF(btrim(COALESCE(_name, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _status NOT IN ('linked', 'ignored') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF v_name IS NOT NULL AND length(v_name) > 120 THEN RAISE EXCEPTION 'name_too_long'; END IF;

  SELECT company_id INTO v_company
    FROM public.pluggy_accounts
   WHERE id = _account_id
   FOR UPDATE;

  IF v_company IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;

  IF NOT COALESCE(private.pluggy_can_manage_accounts(v_uid, v_company), false) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _status = 'linked' THEN
    IF _credit_card_id IS NULL THEN RAISE EXCEPTION 'credit_card_required'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.credit_cards c
       WHERE c.id = _credit_card_id
         AND c.company_id = v_company
         AND c.context = 'pj'
    ) THEN
      RAISE EXCEPTION 'credit_card_company_mismatch';
    END IF;
  END IF;

  UPDATE public.pluggy_accounts
     SET credit_review_status = _status,
         credit_review_at = now(),
         credit_review_by = v_uid,
         linked_credit_card_id = CASE WHEN _status = 'linked' THEN _credit_card_id ELSE NULL END,
         name = COALESCE(v_name, name),
         updated_at = now()
   WHERE id = _account_id;

  RETURN _account_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) TO authenticated;