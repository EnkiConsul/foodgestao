
-- Bloco 2: cursor v2 por conta
ALTER TABLE public.open_finance_accounts
  ADD COLUMN IF NOT EXISTS sync_cursor_next text;

-- Bloco 3: marcar transações deletadas na origem
ALTER TABLE public.open_finance_transactions_raw
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_of_raw_deleted_at
  ON public.open_finance_transactions_raw(deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Bloco 5: rastrear remoção remota do item na Pluggy
ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS needs_remote_delete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS remote_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_of_connections_pending_remote_delete
  ON public.open_finance_connections(id)
  WHERE needs_remote_delete = true AND remote_deleted_at IS NULL;

-- Bloco 3: reescreve auto_promote para respeitar deleted_at e cancelar promoções obsoletas
CREATE OR REPLACE FUNCTION public.auto_promote_open_finance_raw(_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _inserted int := 0;
  _duplicates int := 0;
  _skipped int := 0;
  _errors int := 0;
  _cancelled int := 0;
  r record;
  d record;
  _amount numeric;
  _tx_type transaction_type;
  _hash text;
  _desc text;
  _date date;
  _tx_id uuid;
  _existing_id uuid;
BEGIN
  -- Passo 1: aplicar deleções vindas da Pluggy.
  -- Se a raw foi marcada como deleted_at e já havia sido promovida, cancela a transação.
  FOR d IN
    SELECT raw.id, raw.transaction_id
      FROM public.open_finance_transactions_raw raw
     WHERE raw.connection_id = _connection_id
       AND raw.deleted_at IS NOT NULL
       AND raw.transaction_id IS NOT NULL
     LIMIT 5000
  LOOP
    BEGIN
      UPDATE public.transactions
         SET status = 'cancelado',
             updated_at = now()
       WHERE id = d.transaction_id
         AND status <> 'cancelado';
      IF FOUND THEN _cancelled := _cancelled + 1; END IF;
      -- desassociar para evitar reprocessamento contínuo
      UPDATE public.open_finance_transactions_raw
         SET transaction_id = NULL, processed_at = now(), updated_at = now()
       WHERE id = d.id;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      UPDATE public.open_finance_transactions_raw
         SET error = SQLERRM, updated_at = now()
       WHERE id = d.id;
    END;
  END LOOP;

  -- Passo 2: promoção normal (ignora deleted_at)
  FOR r IN
    SELECT raw.id, raw.of_account_id, raw.company_id, raw.connection_id,
           raw.pluggy_transaction_id, raw.import_hash, raw.raw AS payload,
           ofa.local_account_id, ofa.ignored, ofa.auto_import
      FROM public.open_finance_transactions_raw raw
      JOIN public.open_finance_accounts ofa ON ofa.id = raw.of_account_id
     WHERE raw.connection_id = _connection_id
       AND raw.processed_at IS NULL
       AND raw.deleted_at IS NULL
     ORDER BY raw.created_at ASC
     LIMIT 5000
  LOOP
    BEGIN
      IF r.local_account_id IS NULL OR r.ignored = true OR COALESCE(r.auto_import, false) = false THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      _hash := r.import_hash;

      SELECT id INTO _existing_id
        FROM public.transactions
       WHERE import_hash = _hash
         AND company_id IS NOT DISTINCT FROM r.company_id
       LIMIT 1;

      IF _existing_id IS NOT NULL THEN
        UPDATE public.open_finance_transactions_raw
           SET processed_at = now(), transaction_id = _existing_id, updated_at = now()
         WHERE id = r.id;
        _duplicates := _duplicates + 1;
        CONTINUE;
      END IF;

      _amount := COALESCE((r.payload->>'amount')::numeric, 0);
      _tx_type := CASE
        WHEN upper(COALESCE(r.payload->>'type','')) = 'CREDIT' THEN 'receita'::transaction_type
        WHEN _amount >= 0 THEN 'receita'::transaction_type
        ELSE 'despesa'::transaction_type
      END;
      _desc := COALESCE(NULLIF(trim(r.payload->>'description'), ''), r.payload->>'descriptionRaw', 'Lançamento Open Finance');
      _date := COALESCE((r.payload->>'date')::date, current_date);

      INSERT INTO public.transactions (
        user_id, account_id, company_id, context,
        transaction_type, status, description, amount,
        transaction_date, import_hash, external_id,
        connection_id, connection_account_id,
        provider_status, provider_category,
        categorization_source
      )
      SELECT
        a.user_id, r.local_account_id, r.company_id, 'pj'::context_type,
        _tx_type, 'confirmado', _desc, abs(_amount),
        _date, _hash, r.pluggy_transaction_id,
        r.connection_id, r.of_account_id,
        r.payload->>'status', r.payload->>'category',
        'open_finance'
        FROM public.accounts a
       WHERE a.id = r.local_account_id
      RETURNING id INTO _tx_id;

      UPDATE public.open_finance_transactions_raw
         SET processed_at = now(), transaction_id = _tx_id, updated_at = now()
       WHERE id = r.id;
      _inserted := _inserted + 1;
    EXCEPTION WHEN OTHERS THEN
      _errors := _errors + 1;
      UPDATE public.open_finance_transactions_raw
         SET error = SQLERRM, updated_at = now()
       WHERE id = r.id;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', _inserted,
    'duplicates', _duplicates,
    'skipped', _skipped,
    'errors', _errors,
    'cancelled', _cancelled
  );
END $function$;

-- Bloco 5: desconexão agora agenda remoção remota
CREATE OR REPLACE FUNCTION public.disconnect_open_finance_connection(_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _company_id uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id FROM public.open_finance_connections WHERE id = _connection_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_connection not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_connections
     SET status = 'disconnected',
         disconnected_at = now(),
         needs_remote_delete = true,
         updated_at = now()
   WHERE id = _connection_id;
  UPDATE public.open_finance_accounts
     SET auto_import = false, updated_at = now()
   WHERE connection_id = _connection_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_connection_disconnected',
    _entity_type := 'open_finance_connection',
    _entity_id := _connection_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'needs_remote_delete', true)
  );
END $function$;

-- Extensões requeridas para cron real (Bloco 4). Agendamento em passo separado.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
