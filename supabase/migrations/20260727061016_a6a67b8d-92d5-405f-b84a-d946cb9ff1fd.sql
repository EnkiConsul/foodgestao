CREATE OR REPLACE FUNCTION public.delete_account(_account_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _context context_type;
  _caller uuid := auth.uid();
  _has_tx boolean;
BEGIN
  SELECT company_id, context INTO _company_id, _context
    FROM public.accounts WHERE id = _account_id;
  IF _context IS NULL THEN RAISE EXCEPTION 'account not found'; END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = _account_id AND user_id = _caller) THEN
      RAISE EXCEPTION 'permission denied';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.open_finance_accounts WHERE local_account_id = _account_id
  ) THEN
    RAISE EXCEPTION 'desconecte o Open Finance antes de excluir esta conta';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE account_id = _account_id
        OR destination_account_id = _account_id
        OR connection_account_id = _account_id
  ) INTO _has_tx;

  IF _has_tx THEN
    UPDATE public.accounts
       SET is_active = false, soft_deleted_at = now(), updated_at = now()
     WHERE id = _account_id;

    PERFORM public.insert_audit_log(
      _action := 'account_soft_deleted',
      _entity_type := 'account',
      _entity_id := _account_id::text,
      _details := jsonb_build_object('company_id', _company_id, 'context', _context, 'reason', 'has_transactions')
    );
    RETURN 'soft';
  END IF;

  DELETE FROM public.accounts WHERE id = _account_id;

  PERFORM public.insert_audit_log(
    _action := 'account_hard_deleted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'context', _context)
  );
  RETURN 'hard';
END $function$;

REVOKE ALL ON FUNCTION public.delete_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_account(uuid) TO authenticated, service_role;