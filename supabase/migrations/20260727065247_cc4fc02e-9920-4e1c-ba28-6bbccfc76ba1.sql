
-- 1) Marca ajuste de saldo em transactions
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS is_balance_adjustment boolean NOT NULL DEFAULT false;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS adjustment_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tx_adjustment_idem
  ON public.transactions (user_id, adjustment_idempotency_key)
  WHERE adjustment_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tx_is_balance_adjustment
  ON public.transactions (account_id)
  WHERE is_balance_adjustment = true;

-- 2) Revoga UPDATE amplo e concede apenas nas colunas seguras
REVOKE UPDATE ON public.accounts FROM authenticated;
GRANT UPDATE (
  name, account_type, context, color, icon, is_active,
  bank_slug, agency, account_number, document_last4,
  reference_balance_date, company_id, updated_at, soft_deleted_at
) ON public.accounts TO authenticated;

-- 3) Guard reforçado: bloqueia qualquer mudança direta em current_balance
-- ou initial_balance fora do motor financeiro (flag app.balance_engine = 'on').
CREATE OR REPLACE FUNCTION public.guard_of_current_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _engine text := current_setting('app.balance_engine', true);
BEGIN
  IF (NEW.current_balance IS DISTINCT FROM OLD.current_balance
      OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance)
     AND COALESCE(_engine, '') <> 'on' THEN
    RAISE EXCEPTION
      'saldo de conta e controlado pelo motor financeiro; use adjust_account_balance() ou recompute_account_balance()'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4) recompute_account_balance: respeita reference_balance_date + habilita flag
CREATE OR REPLACE FUNCTION public.recompute_account_balance(_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _acc public.accounts;
  _movements numeric;
  _new_balance numeric;
  _ref date;
BEGIN
  SELECT * INTO _acc FROM public.accounts WHERE id = _account_id FOR UPDATE;
  IF _acc IS NULL THEN
    RAISE EXCEPTION 'Account not found' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL
     AND _acc.user_id <> auth.uid()
     AND NOT public.is_super_admin(auth.uid())
     AND NOT (
       _acc.context = 'pj' AND _acc.company_id IS NOT NULL
       AND private.is_company_member(auth.uid(), _acc.company_id)
     ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  _ref := _acc.reference_balance_date;

  SELECT COALESCE(SUM(
    CASE
      WHEN t.transaction_type = 'receita'       AND t.account_id = _account_id THEN t.amount
      WHEN t.transaction_type = 'despesa'       AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.account_id = _account_id THEN -t.amount
      WHEN t.transaction_type = 'transferencia' AND t.destination_account_id = _account_id THEN t.amount
      ELSE 0
    END
  ), 0)
  INTO _movements
  FROM public.transactions t
  WHERE t.status = 'confirmado'
    AND (t.account_id = _account_id OR t.destination_account_id = _account_id)
    AND (_ref IS NULL OR t.transaction_date >= _ref);

  _new_balance := COALESCE(_acc.initial_balance, 0) + _movements;

  PERFORM set_config('app.balance_engine', 'on', true);
  UPDATE public.accounts
     SET current_balance = _new_balance
   WHERE id = _account_id;

  RETURN _new_balance;
END;
$$;

-- 5) adjust_account_balance com idempotência + FOR UPDATE + marca de ajuste
DROP FUNCTION IF EXISTS public.adjust_account_balance(uuid, numeric, date, text);

CREATE OR REPLACE FUNCTION public.adjust_account_balance(
  _account_id uuid,
  _target_balance numeric,
  _adjust_date date,
  _note text,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  _existing uuid;
BEGIN
  -- idempotência
  IF _idempotency_key IS NOT NULL AND _caller IS NOT NULL THEN
    SELECT id INTO _existing
      FROM public.transactions
     WHERE user_id = _caller
       AND adjustment_idempotency_key = _idempotency_key
     LIMIT 1;
    IF _existing IS NOT NULL THEN
      RETURN _existing;
    END IF;
  END IF;

  SELECT company_id, context, current_balance
    INTO _company_id, _context, _current
    FROM public.accounts WHERE id = _account_id
    FOR UPDATE;
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

  IF _note IS NULL OR length(trim(_note)) = 0 THEN
    RAISE EXCEPTION 'justificativa do ajuste e obrigatoria';
  END IF;

  _delta := COALESCE(_target_balance, 0) - COALESCE(_current, 0);
  IF _delta = 0 THEN
    RAISE EXCEPTION 'saldo alvo igual ao saldo atual; nenhum ajuste necessario';
  END IF;

  _tx_type := CASE WHEN _delta > 0 THEN 'receita'::transaction_type ELSE 'despesa'::transaction_type END;
  _description := 'Ajuste de saldo — ' || _note;

  INSERT INTO public.transactions (
    user_id, account_id, company_id, context,
    transaction_type, status, description, amount,
    transaction_date, notes, is_balance_adjustment, adjustment_idempotency_key
  ) VALUES (
    _caller, _account_id, _company_id, _context,
    _tx_type, 'confirmado', _description, abs(_delta),
    COALESCE(_adjust_date, current_date), _note, true, _idempotency_key
  )
  RETURNING id INTO _tx_id;

  PERFORM public.insert_audit_log(
    _action := 'account_balance_adjusted',
    _entity_type := 'account',
    _entity_id := _account_id::text,
    _details := jsonb_build_object(
      'previous_balance', _current,
      'target_balance', _target_balance,
      'delta', _delta,
      'transaction_id', _tx_id,
      'note', _note
    )
  );

  RETURN _tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_account_balance(uuid, numeric, date, text, text) TO authenticated;

-- 6) report_balance_drift: audita divergências entre saldo armazenado e calculado
CREATE OR REPLACE FUNCTION public.report_balance_drift()
RETURNS TABLE(
  account_id uuid,
  account_name text,
  context context_type,
  company_id uuid,
  stored_balance numeric,
  computed_balance numeric,
  drift numeric
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
          WHEN t.transaction_type = 'receita'       AND t.account_id = s.id THEN t.amount
          WHEN t.transaction_type = 'despesa'       AND t.account_id = s.id THEN -t.amount
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
         s.current_balance AS stored_balance,
         (COALESCE(s.initial_balance,0) + COALESCE(m.total,0)) AS computed_balance,
         (s.current_balance - (COALESCE(s.initial_balance,0) + COALESCE(m.total,0))) AS drift
    FROM scope s
    LEFT JOIN mov m ON m.aid = s.id
   WHERE ABS(s.current_balance - (COALESCE(s.initial_balance,0) + COALESCE(m.total,0))) > 0.005;
END;
$$;

GRANT EXECUTE ON FUNCTION public.report_balance_drift() TO authenticated;
