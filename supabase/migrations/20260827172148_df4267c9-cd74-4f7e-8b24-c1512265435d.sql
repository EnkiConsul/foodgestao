-- 1) Saldo do banco separado do saldo do razão
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS bank_balance numeric(18,2),
  ADD COLUMN IF NOT EXISTS bank_balance_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_balance_source text;

UPDATE public.accounts a
   SET bank_balance = a.current_balance,
       bank_balance_at = now(),
       bank_balance_source = 'open_finance'
 WHERE a.bank_balance IS NULL
   AND EXISTS (SELECT 1 FROM public.pluggy_accounts pa WHERE pa.linked_account_id = a.id);

-- 2) Open Finance grava apenas o saldo do banco
CREATE OR REPLACE FUNCTION public.sync_of_account_balance(
  _account_id uuid,
  _new_balance numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_initial numeric;
  v_current numeric;
  v_has_tx boolean;
BEGIN
  IF _new_balance IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(initial_balance, 0), COALESCE(current_balance, 0)
    INTO v_initial, v_current
    FROM public.accounts
   WHERE id = _account_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE (account_id = _account_id OR destination_account_id = _account_id)
       AND status = 'confirmado'
  ) INTO v_has_tx;

  IF v_initial = 0 AND v_current = 0 AND NOT v_has_tx THEN
    -- Conta recém-conectada e sem razão: o saldo do banco semeia o saldo inicial.
    PERFORM set_config('app.balance_engine', 'on', true);
    UPDATE public.accounts
       SET initial_balance = _new_balance,
           current_balance = _new_balance,
           bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  ELSE
    -- Razão é a fonte da verdade: o banco fica apenas como referência.
    UPDATE public.accounts
       SET bank_balance = _new_balance,
           bank_balance_at = now(),
           bank_balance_source = 'open_finance',
           updated_at = now()
     WHERE id = _account_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_of_account_balance(uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_of_account_balance(uuid, numeric) TO service_role;

-- 3) Divergência: razão x banco
ALTER TABLE public.balance_drift_snapshots
  ADD COLUMN IF NOT EXISTS bank_balance numeric,
  ADD COLUMN IF NOT EXISTS bank_drift numeric;

DROP FUNCTION IF EXISTS public.report_balance_drift();

CREATE FUNCTION public.report_balance_drift()
RETURNS TABLE(
  account_id uuid, account_name text, context context_type, company_id uuid,
  stored_balance numeric, computed_balance numeric, drift numeric,
  bank_balance numeric, bank_drift numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH scope AS (
    SELECT a.*
      FROM public.accounts a
     WHERE a.soft_deleted_at IS NULL
       AND (
         a.user_id = auth.uid()
         OR public.is_super_admin(auth.uid())
         OR (a.context = 'pj' AND a.company_id IS NOT NULL
             AND private.is_company_member(auth.uid(), a.company_id))
       )
  ),
  mov AS (
    SELECT s.id AS aid,
      COALESCE(SUM(
        CASE
          WHEN t.transaction_type = 'entrada'       AND t.account_id = s.id THEN t.amount
          WHEN t.transaction_type = 'saida'         AND t.account_id = s.id THEN -t.amount
          WHEN t.transaction_type = 'transferencia' AND t.account_id = s.id THEN -t.amount
          WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = s.id THEN t.amount
          ELSE 0
        END
      ), 0) AS total
    FROM scope s
    LEFT JOIN public.transactions t
      ON (t.account_id = s.id OR t.destination_account_id = s.id)
     AND t.status = 'confirmado'
     AND (s.reference_balance_date IS NULL OR t.transaction_date >= s.reference_balance_date)
    GROUP BY s.id
  )
  SELECT s.id, s.name, s.context, s.company_id,
         s.current_balance,
         (COALESCE(s.initial_balance,0) + COALESCE(m.total,0)),
         (s.current_balance - (COALESCE(s.initial_balance,0) + COALESCE(m.total,0))),
         s.bank_balance,
         CASE WHEN s.bank_balance IS NULL THEN NULL
              ELSE (s.bank_balance - s.current_balance) END
    FROM scope s
    LEFT JOIN mov m ON m.aid = s.id
   WHERE ABS(s.current_balance - (COALESCE(s.initial_balance,0) + COALESCE(m.total,0))) > 0.005
      OR (s.bank_balance IS NOT NULL AND ABS(s.bank_balance - s.current_balance) > 0.005);
END;
$$;

REVOKE ALL ON FUNCTION public.report_balance_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_balance_drift() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.run_balance_drift_scan()
RETURNS TABLE(scan_id uuid, drift_count integer, scanned_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _scan_id uuid := gen_random_uuid();
  _now timestamptz := now();
  _count integer := 0;
  _caller uuid := auth.uid();
  _claims_role text := (current_setting('request.jwt.claims', true)::jsonb->>'role');
BEGIN
  IF _caller IS NOT NULL THEN
    IF NOT public.has_role(_caller, 'super_admin') THEN
      RAISE EXCEPTION 'forbidden: super_admin required';
    END IF;
  ELSE
    IF _claims_role IS NOT NULL AND _claims_role NOT IN ('service_role','postgres') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  INSERT INTO public.balance_drift_snapshots
    (scan_id, scanned_at, account_id, account_name, context, company_id,
     stored_balance, computed_balance, drift, bank_balance, bank_drift)
  SELECT
    _scan_id, _now, d.account_id, d.account_name, d.context, d.company_id,
    d.stored_balance, d.computed_balance, d.drift, d.bank_balance, d.bank_drift
  FROM public.report_balance_drift() d;

  GET DIAGNOSTICS _count = ROW_COUNT;

  RETURN QUERY SELECT _scan_id, _count, _now;
END $$;

REVOKE ALL ON FUNCTION public.run_balance_drift_scan() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_balance_drift_scan() TO authenticated, service_role;

-- 4) Revisão de alterações na origem (Open Finance)
CREATE TABLE IF NOT EXISTS public.transaction_origin_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  staging_id uuid,
  company_id uuid NOT NULL,
  pluggy_transaction_id text,
  previous jsonb NOT NULL,
  incoming jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  resolution_note text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.transaction_origin_changes TO authenticated;
GRANT ALL ON public.transaction_origin_changes TO service_role;

ALTER TABLE public.transaction_origin_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read origin changes"
ON public.transaction_origin_changes
FOR SELECT TO authenticated
USING (private.is_company_member(auth.uid(), company_id) OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_origin_changes_pending
  ON public.transaction_origin_changes (company_id, status);

CREATE OR REPLACE FUNCTION public.transaction_origin_changes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_origin_changes_touch ON public.transaction_origin_changes;
CREATE TRIGGER trg_origin_changes_touch
BEFORE UPDATE ON public.transaction_origin_changes
FOR EACH ROW EXECUTE FUNCTION public.transaction_origin_changes_touch();

-- 4a) Lançamento confirmado de Open Finance é imutável fora do caminho auditado
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
    RAISE EXCEPTION 'confirmed_open_finance_tx_immutable: use a revisão de alteração na origem';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_confirmed_of_tx ON public.transactions;
CREATE TRIGGER trg_guard_confirmed_of_tx
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_open_finance_tx();

-- 4b) Registro da alteração vinda do banco (uso interno da integração)
CREATE OR REPLACE FUNCTION public.pluggy_register_origin_change(
  _transaction_id uuid,
  _staging_id uuid,
  _incoming jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tx RECORD;
  v_id uuid;
BEGIN
  SELECT id, company_id, amount, transaction_date, description, pluggy_transaction_id
    INTO v_tx
    FROM public.transactions
   WHERE id = _transaction_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
    FROM public.transaction_origin_changes
   WHERE transaction_id = _transaction_id
     AND status = 'pending'
     AND incoming = _incoming
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.transaction_origin_changes
    (transaction_id, staging_id, company_id, pluggy_transaction_id, previous, incoming)
  VALUES (
    v_tx.id, _staging_id, v_tx.company_id, v_tx.pluggy_transaction_id,
    jsonb_build_object(
      'amount', v_tx.amount,
      'transaction_date', v_tx.transaction_date,
      'description', v_tx.description
    ),
    _incoming
  )
  RETURNING id INTO v_id;

  UPDATE public.transactions
     SET needs_review = true,
         review_reason = 'alterado_na_origem'
   WHERE id = _transaction_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_register_origin_change(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pluggy_register_origin_change(uuid, uuid, jsonb) TO service_role;

-- 4c) Resolução pelo usuário: aceitar a nova versão ou manter a atual
CREATE OR REPLACE FUNCTION public.resolve_transaction_origin_change(
  _change_id uuid,
  _accept boolean,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_change RECORD;
  v_amount numeric;
  v_date date;
  v_desc text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_change
    FROM public.transaction_origin_changes
   WHERE id = _change_id AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'change_not_found';
  END IF;

  IF NOT (private.is_company_member(auth.uid(), v_change.company_id)
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _accept THEN
    v_amount := ROUND(ABS(COALESCE((v_change.incoming->>'amount')::numeric, 0)), 2);
    v_date := NULLIF(v_change.incoming->>'transaction_date', '')::date;
    v_desc := NULLIF(TRIM(COALESCE(v_change.incoming->>'description', '')), '');
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_incoming_amount';
    END IF;

    PERFORM set_config('app.origin_change', 'on', true);
    UPDATE public.transactions
       SET amount = v_amount,
           amount_paid = CASE WHEN amount_paid > 0 THEN v_amount ELSE amount_paid END,
           transaction_date = COALESCE(v_date, transaction_date),
           description = COALESCE(v_desc, description),
           needs_review = false,
           review_reason = NULL
     WHERE id = v_change.transaction_id;
  ELSE
    UPDATE public.transactions
       SET needs_review = false,
           review_reason = NULL
     WHERE id = v_change.transaction_id;
  END IF;

  UPDATE public.transaction_origin_changes
     SET status = CASE WHEN _accept THEN 'accepted' ELSE 'kept' END,
         resolution_note = _note,
         resolved_at = now(),
         resolved_by = auth.uid()
   WHERE id = _change_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_transaction_origin_change(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_transaction_origin_change(uuid, boolean, text) TO authenticated;