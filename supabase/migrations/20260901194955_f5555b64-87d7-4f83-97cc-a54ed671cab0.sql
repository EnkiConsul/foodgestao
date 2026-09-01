-- Helper: purge Open Finance residue linked to a deleted account/card
CREATE OR REPLACE FUNCTION public.purge_open_finance_link(_account_id uuid DEFAULT NULL, _card_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pa record;
  _conns uuid[] := '{}';
  _conn uuid;
BEGIN
  IF _account_id IS NULL AND _card_id IS NULL THEN RETURN; END IF;

  FOR _pa IN
    SELECT id, pluggy_account_id, connection_id
      FROM public.pluggy_accounts
     WHERE (_account_id IS NOT NULL AND linked_account_id = _account_id)
        OR (_card_id IS NOT NULL AND linked_credit_card_id = _card_id)
  LOOP
    DELETE FROM public.pluggy_staging_transactions
     WHERE pluggy_account_id = _pa.pluggy_account_id
       AND status = 'pending';
    DELETE FROM public.pluggy_accounts WHERE id = _pa.id;
    IF _pa.connection_id IS NOT NULL AND NOT (_pa.connection_id = ANY(_conns)) THEN
      _conns := _conns || _pa.connection_id;
    END IF;
  END LOOP;

  FOREACH _conn IN ARRAY _conns LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pluggy_accounts
       WHERE connection_id = _conn
         AND (linked_account_id IS NOT NULL OR linked_credit_card_id IS NOT NULL)
    ) THEN
      UPDATE public.pluggy_connections
         SET status = 'deleted', updated_at = now()
       WHERE id = _conn;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.purge_open_finance_link(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_open_finance_link(uuid, uuid) TO service_role;

-- delete_account now purges the Open Finance link in both branches
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

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE account_id = _account_id
        OR destination_account_id = _account_id
        OR connection_account_id = _account_id
  ) INTO _has_tx;

  PERFORM public.purge_open_finance_link(_account_id := _account_id);

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

-- Card deletion purges its Open Finance link too
CREATE OR REPLACE FUNCTION public.credit_cards_purge_open_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.purge_open_finance_link(_card_id := OLD.id);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_credit_cards_purge_open_finance ON public.credit_cards;
CREATE TRIGGER trg_credit_cards_purge_open_finance
BEFORE DELETE ON public.credit_cards
FOR EACH ROW EXECUTE FUNCTION public.credit_cards_purge_open_finance();