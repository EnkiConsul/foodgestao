
-- ============================================================
-- Bloco 5/8/9 (DB) — Finalização Open Finance
-- ============================================================

-- 1) Colunas em accounts
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS reference_balance_date date,
  ADD COLUMN IF NOT EXISTS soft_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_accounts_soft_deleted
  ON public.accounts (soft_deleted_at)
  WHERE soft_deleted_at IS NOT NULL;

-- 2) Coluna em open_finance_connections
ALTER TABLE public.open_finance_connections
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

-- 3) Índice para o promotor raw -> transactions
CREATE INDEX IF NOT EXISTS idx_of_raw_of_account_unprocessed
  ON public.open_finance_transactions_raw (of_account_id)
  WHERE processed_at IS NULL;

-- ============================================================
-- 4) Trigger: guarda de current_balance em contas conectadas
-- ============================================================
CREATE OR REPLACE FUNCTION public.guard_of_current_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_balance IS DISTINCT FROM OLD.current_balance THEN
    IF EXISTS (
      SELECT 1 FROM public.open_finance_accounts
       WHERE local_account_id = NEW.id
    ) THEN
      RAISE EXCEPTION
        'saldo atual de conta conectada via Open Finance nao pode ser editado diretamente; use adjust_account_balance()'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_of_current_balance ON public.accounts;
CREATE TRIGGER trg_guard_of_current_balance
BEFORE UPDATE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.guard_of_current_balance();

-- ============================================================
-- 5) Trigger: impede DELETE físico de contas com histórico
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_account_with_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.transactions WHERE account_id = OLD.id OR destination_account_id = OLD.id) THEN
    RAISE EXCEPTION 'conta possui lancamentos; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.open_finance_accounts WHERE local_account_id = OLD.id) THEN
    RAISE EXCEPTION 'conta esta vinculada a uma conexao Open Finance; desconecte antes de excluir' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.credit_card_invoices WHERE payment_account_id = OLD.id) THEN
    RAISE EXCEPTION 'conta possui faturas de cartao vinculadas; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_hard_delete_account ON public.accounts;
CREATE TRIGGER trg_prevent_hard_delete_account
BEFORE DELETE ON public.accounts
FOR EACH ROW
EXECUTE FUNCTION public.prevent_hard_delete_account_with_history();

-- ============================================================
-- 6) RPCs Open Finance (gestão de vínculos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_open_finance_auto_import(
  _of_account_id uuid,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id FROM public.open_finance_accounts WHERE id = _of_account_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_account not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_accounts
     SET auto_import = _enabled, updated_at = now()
   WHERE id = _of_account_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_auto_import_set',
    _entity_type := 'open_finance_account',
    _entity_id := _of_account_id::text,
    _details := jsonb_build_object('enabled', _enabled, 'company_id', _company_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.ignore_open_finance_account(
  _of_account_id uuid,
  _ignored boolean DEFAULT true
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id FROM public.open_finance_accounts WHERE id = _of_account_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_account not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_accounts
     SET ignored = _ignored,
         auto_import = CASE WHEN _ignored THEN false ELSE auto_import END,
         updated_at = now()
   WHERE id = _of_account_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_account_ignored',
    _entity_type := 'open_finance_account',
    _entity_id := _of_account_id::text,
    _details := jsonb_build_object('ignored', _ignored, 'company_id', _company_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.unlink_open_finance_account(
  _of_account_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid; _local uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id, local_account_id INTO _company_id, _local
    FROM public.open_finance_accounts WHERE id = _of_account_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_account not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_accounts
     SET local_account_id = NULL, auto_import = false, updated_at = now()
   WHERE id = _of_account_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_account_unlinked',
    _entity_type := 'open_finance_account',
    _entity_id := _of_account_id::text,
    _details := jsonb_build_object('previous_local_account_id', _local, 'company_id', _company_id)
  );
END $$;

CREATE OR REPLACE FUNCTION public.disconnect_open_finance_connection(
  _connection_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid; _caller uuid := auth.uid();
BEGIN
  SELECT company_id INTO _company_id FROM public.open_finance_connections WHERE id = _connection_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_connection not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;
  UPDATE public.open_finance_connections
     SET status = 'disconnected', disconnected_at = now(), updated_at = now()
   WHERE id = _connection_id;
  UPDATE public.open_finance_accounts
     SET auto_import = false, updated_at = now()
   WHERE connection_id = _connection_id;
  PERFORM public.insert_audit_log(
    _action := 'open_finance_connection_disconnected',
    _entity_type := 'open_finance_connection',
    _entity_id := _connection_id::text,
    _details := jsonb_build_object('company_id', _company_id)
  );
END $$;

-- ============================================================
-- 7) Soft delete de conta
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_account(
  _account_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company_id uuid; _context context_type; _caller uuid := auth.uid();
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
    SELECT 1 FROM public.open_finance_accounts
     WHERE local_account_id = _account_id
  ) THEN
    RAISE EXCEPTION 'desconecte o Open Finance antes de excluir esta conta';
  END IF;

  UPDATE public.accounts
     SET is_active = false, soft_deleted_at = now(), updated_at = now()
   WHERE id = _account_id;

  PERFORM public.insert_audit_log(
    _action := 'account_soft_deleted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object('company_id', _company_id, 'context', _context)
  );
END $$;

-- ============================================================
-- 8) Ajustar saldo via lançamento auditável
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_account_balance(
  _account_id uuid,
  _target_balance numeric,
  _adjust_date date,
  _note text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _context context_type;
  _current numeric;
  _delta numeric;
  _tx_type transaction_type;
  _tx_id uuid;
  _caller uuid := auth.uid();
  _description text;
BEGIN
  SELECT company_id, context, current_balance
    INTO _company_id, _context, _current
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

  _delta := COALESCE(_target_balance, 0) - COALESCE(_current, 0);
  IF _delta = 0 THEN
    RAISE EXCEPTION 'saldo alvo igual ao saldo atual; nenhum ajuste necessario';
  END IF;

  _tx_type := CASE WHEN _delta > 0 THEN 'receita'::transaction_type ELSE 'despesa'::transaction_type END;
  _description := 'Ajuste de saldo' || CASE WHEN _note IS NOT NULL AND length(trim(_note)) > 0 THEN ' — ' || _note ELSE '' END;

  INSERT INTO public.transactions (
    user_id, account_id, company_id, context,
    transaction_type, status, description, amount,
    transaction_date, notes
  ) VALUES (
    _caller, _account_id, _company_id, _context,
    _tx_type, 'confirmado', _description, abs(_delta),
    COALESCE(_adjust_date, current_date), _note
  )
  RETURNING id INTO _tx_id;

  PERFORM public.insert_audit_log(
    _action := 'account_balance_adjusted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object(
      'previous', _current, 'target', _target_balance, 'delta', _delta,
      'transaction_id', _tx_id, 'company_id', _company_id
    )
  );

  RETURN _tx_id;
END $$;

-- ============================================================
-- 9) Promover raw -> transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.promote_open_finance_transactions(
  _connection_id uuid,
  _max_rows integer DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
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
  SELECT company_id INTO _company_id FROM public.open_finance_connections WHERE id = _connection_id;
  IF _company_id IS NULL THEN RAISE EXCEPTION 'open_finance_connection not found'; END IF;
  IF NOT public.is_company_admin_or_owner(_caller, _company_id) THEN
    RAISE EXCEPTION 'permission denied for company %', _company_id;
  END IF;

  FOR r IN
    SELECT raw.id, raw.of_account_id, raw.company_id, raw.pluggy_transaction_id,
           raw.import_hash, raw.raw AS payload,
           ofa.local_account_id, ofa.auto_import, ofa.ignored
      FROM public.open_finance_transactions_raw raw
      JOIN public.open_finance_accounts ofa ON ofa.id = raw.of_account_id
     WHERE raw.connection_id = _connection_id
       AND raw.processed_at IS NULL
     ORDER BY raw.created_at ASC
     LIMIT GREATEST(_max_rows, 1)
  LOOP
    BEGIN
      IF r.local_account_id IS NULL OR r.auto_import = false OR r.ignored = true THEN
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
        _connection_id, r.of_account_id,
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
      UPDATE public.open_finance_transactions_raw
         SET error = left(SQLERRM, 500), updated_at = now()
       WHERE id = r.id;
      _errors := _errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', _inserted,
    'duplicates', _duplicates,
    'skipped_no_local', _skipped,
    'errors', _errors
  );
END $$;

-- ============================================================
-- 10) RLS complementar — leitura por membros da empresa
-- ============================================================
DROP POLICY IF EXISTS of_raw_select_members ON public.open_finance_transactions_raw;
CREATE POLICY of_raw_select_members
  ON public.open_finance_transactions_raw
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = open_finance_transactions_raw.company_id
       AND cm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS of_sync_runs_select_members ON public.open_finance_sync_runs;
CREATE POLICY of_sync_runs_select_members
  ON public.open_finance_sync_runs
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = open_finance_sync_runs.company_id
       AND cm.user_id = auth.uid()
  ));

-- ============================================================
-- 11) GRANTs
-- ============================================================
GRANT SELECT ON public.open_finance_transactions_raw TO authenticated;
GRANT SELECT ON public.open_finance_sync_runs TO authenticated;

GRANT EXECUTE ON FUNCTION public.set_open_finance_auto_import(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ignore_open_finance_account(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_open_finance_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disconnect_open_finance_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_account(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_open_finance_transactions(uuid, integer) TO authenticated;
