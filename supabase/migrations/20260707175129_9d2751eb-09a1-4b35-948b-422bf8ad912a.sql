
-- 1) Colunas de controle de sincronização em bank_connection_accounts
ALTER TABLE public.bank_connection_accounts
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_tx_date date;

-- 2) Coluna provider_transaction_id em transactions + índice único parcial
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider_transaction_id text;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_tx_uniq
  ON public.transactions (account_id, provider_transaction_id)
  WHERE provider_transaction_id IS NOT NULL;

-- 3) Tabela de eventos de webhook Pluggy
CREATE TABLE IF NOT EXISTS public.pluggy_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  item_id text,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  error text
);

GRANT ALL ON public.pluggy_webhook_events TO service_role;
GRANT SELECT ON public.pluggy_webhook_events TO authenticated;

ALTER TABLE public.pluggy_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin can view pluggy webhook events" ON public.pluggy_webhook_events;
CREATE POLICY "super_admin can view pluggy webhook events"
  ON public.pluggy_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS pluggy_webhook_events_item_idx
  ON public.pluggy_webhook_events (item_id, received_at DESC);

-- 4) RPC de upsert de transação vinda do provedor
CREATE OR REPLACE FUNCTION public.pluggy_upsert_transaction(
  _account_id uuid,
  _provider_tx_id text,
  _description text,
  _amount numeric,
  _transaction_date date,
  _transaction_type public.transaction_type
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _acc public.accounts;
  _tx_id uuid;
BEGIN
  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id;
  IF _acc IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;
  IF _provider_tx_id IS NULL OR length(_provider_tx_id) = 0 THEN
    RAISE EXCEPTION 'provider_transaction_id obrigatório' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO _tx_id
    FROM public.transactions
   WHERE account_id = _account_id
     AND provider_transaction_id = _provider_tx_id
   LIMIT 1;

  IF _tx_id IS NOT NULL THEN
    UPDATE public.transactions
       SET description = COALESCE(_description, description),
           amount = _amount,
           amount_paid = _amount,
           transaction_date = _transaction_date,
           payment_date = _transaction_date,
           updated_at = now()
     WHERE id = _tx_id;
    RETURN _tx_id;
  END IF;

  INSERT INTO public.transactions (
    user_id, context, company_id,
    account_id, description, amount, amount_paid,
    transaction_type, status,
    transaction_date, due_date, payment_date,
    provider_transaction_id
  ) VALUES (
    _acc.user_id, _acc.context, _acc.company_id,
    _account_id, COALESCE(_description, 'Importado via Open Finance'),
    abs(_amount), abs(_amount),
    _transaction_type, 'confirmado'::public.transaction_status,
    _transaction_date, _transaction_date, _transaction_date,
    _provider_tx_id
  )
  RETURNING id INTO _tx_id;

  RETURN _tx_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, public.transaction_type) FROM public;
GRANT EXECUTE ON FUNCTION public.pluggy_upsert_transaction(uuid, text, text, numeric, date, public.transaction_type) TO service_role;

-- 5) Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bank_connection_accounts;
