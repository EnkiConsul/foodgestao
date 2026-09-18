-- 1) Revogar execução das RPCs de UI de PUBLIC/anon; manter authenticated + service_role
REVOKE ALL ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pluggy_clear_staging_suggestions(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pluggy_set_staging_counterparties(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pluggy_set_staging_description(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.pluggy_clear_pending_staging(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_clear_staging_suggestions(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_set_staging_counterparties(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_set_staging_description(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) TO authenticated, service_role;

-- 2) Helper de permissão: exclusivo do service_role (igual pluggy_user_can_edit)
REVOKE ALL ON FUNCTION public.pluggy_user_can_manage_accounts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_user_can_manage_accounts(uuid, uuid) TO service_role;

-- 3) Revisão de cartão: recusar status nulo e exigir conta de crédito
CREATE OR REPLACE FUNCTION public.pluggy_review_credit_account(_account_id uuid, _status text, _credit_card_id uuid DEFAULT NULL::uuid, _name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_type text;
  v_name text := NULLIF(btrim(COALESCE(_name, '')), '');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _account_id IS NULL THEN RAISE EXCEPTION 'account_required'; END IF;
  IF _status IS NULL OR _status NOT IN ('linked', 'ignored') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF v_name IS NOT NULL AND length(v_name) > 120 THEN RAISE EXCEPTION 'name_too_long'; END IF;

  SELECT company_id, upper(COALESCE(type, ''))
    INTO v_company, v_type
    FROM public.pluggy_accounts
   WHERE id = _account_id
   FOR UPDATE;

  IF v_company IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF v_type <> 'CREDIT' THEN RAISE EXCEPTION 'account_not_credit'; END IF;

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

REVOKE ALL ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_review_credit_account(uuid, text, uuid, text) TO authenticated, service_role;