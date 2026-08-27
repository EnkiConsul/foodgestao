CREATE OR REPLACE FUNCTION public.pluggy_register_origin_change(
  _transaction_id uuid,
  _staging_id uuid,
  _incoming jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_register_origin_change(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_register_origin_change(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_transaction_origin_change(
  _change_id uuid,
  _accept boolean,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'origin_change_review_disabled';
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_transaction_origin_change(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_transaction_origin_change(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_confirmed_open_finance_tx()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = 'confirmado'
     AND (OLD.pluggy_transaction_id IS NOT NULL OR OLD.pluggy_staging_transaction_id IS NOT NULL)
     AND COALESCE(current_setting('app.origin_change', true), 'off') <> 'on'
     AND (
       NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.transaction_date IS DISTINCT FROM OLD.transaction_date
       OR NEW.account_id IS DISTINCT FROM OLD.account_id
     )
  THEN
    RAISE EXCEPTION 'confirmed_open_finance_tx_immutable: lançamento conciliado não pode ser alterado pela sincronização';
  END IF;
  RETURN NEW;
END;
$$;