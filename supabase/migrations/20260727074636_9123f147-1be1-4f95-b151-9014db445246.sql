CREATE OR REPLACE FUNCTION public.auto_promote_open_finance_raw(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inserted int := 0;
  _duplicates int := 0;
  _skipped int := 0;
  _errors int := 0;
  r record;
  _amount numeric;
  _tx_type transaction_type;
  _hash text;
  _desc text;
  _date date;
  _tx_id uuid;
  _existing_id uuid;
BEGIN
  FOR r IN
    SELECT raw.id, raw.of_account_id, raw.company_id, raw.connection_id,
           raw.pluggy_transaction_id, raw.import_hash, raw.raw AS payload,
           ofa.local_account_id, ofa.ignored, ofa.auto_import
      FROM public.open_finance_transactions_raw raw
      JOIN public.open_finance_accounts ofa ON ofa.id = raw.of_account_id
     WHERE raw.connection_id = _connection_id
       AND raw.processed_at IS NULL
     ORDER BY raw.created_at ASC
     LIMIT 5000
  LOOP
    BEGIN
      -- Skip: no local mapping / ignored / auto-import disabled -> leave pending for manual review
      IF r.local_account_id IS NULL OR r.ignored = true OR COALESCE(r.auto_import, false) = false THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      _hash := r.import_hash;

      -- Duplicate detection: same hash already materialized
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
    'errors', _errors
  );
END $$;

REVOKE ALL ON FUNCTION public.auto_promote_open_finance_raw(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_open_finance_raw(uuid) TO service_role;