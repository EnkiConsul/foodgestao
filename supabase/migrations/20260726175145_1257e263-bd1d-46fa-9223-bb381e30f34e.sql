
CREATE OR REPLACE FUNCTION public.ignore_open_finance_raw(_raw_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _count int := 0;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  WITH updatable AS (
    SELECT raw.id
      FROM public.open_finance_transactions_raw raw
     WHERE raw.id = ANY(_raw_ids)
       AND raw.processed_at IS NULL
       AND public.is_company_admin_or_owner(_caller, raw.company_id)
  )
  UPDATE public.open_finance_transactions_raw
     SET processed_at = now(),
         error = COALESCE(error, 'ignored_by_user'),
         updated_at = now()
   WHERE id IN (SELECT id FROM updatable);

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN jsonb_build_object('ignored', _count);
END $$;

GRANT EXECUTE ON FUNCTION public.ignore_open_finance_raw(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.promote_open_finance_raw_ids(_raw_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
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
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  FOR r IN
    SELECT raw.id, raw.of_account_id, raw.company_id, raw.connection_id, raw.pluggy_transaction_id,
           raw.import_hash, raw.raw AS payload,
           ofa.local_account_id, ofa.ignored
      FROM public.open_finance_transactions_raw raw
      JOIN public.open_finance_accounts ofa ON ofa.id = raw.of_account_id
     WHERE raw.id = ANY(_raw_ids)
       AND raw.processed_at IS NULL
     ORDER BY raw.created_at ASC
  LOOP
    IF NOT public.is_company_admin_or_owner(_caller, r.company_id) THEN
      _skipped := _skipped + 1;
      CONTINUE;
    END IF;

    BEGIN
      IF r.local_account_id IS NULL OR r.ignored = true THEN
        _skipped := _skipped + 1;
        CONTINUE;
      END IF;

      _hash := r.import_hash;
      IF EXISTS (SELECT 1 FROM public.transactions WHERE import_hash = _hash AND company_id IS NOT DISTINCT FROM r.company_id) THEN
        UPDATE public.open_finance_transactions_raw
           SET processed_at = now(),
               transaction_id = (SELECT id FROM public.transactions WHERE import_hash = _hash AND company_id IS NOT DISTINCT FROM r.company_id LIMIT 1),
               updated_at = now()
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

GRANT EXECUTE ON FUNCTION public.promote_open_finance_raw_ids(uuid[]) TO authenticated;
