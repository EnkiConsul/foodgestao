
-- 1) Fix motor: apply_tx_balance precisa sinalizar app.balance_engine antes do UPDATE
CREATE OR REPLACE FUNCTION public.apply_tx_balance(_tx transactions, _sign integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _tx.status <> 'confirmado' THEN RETURN; END IF;

  PERFORM set_config('app.balance_engine', 'on', true);

  IF _tx.transaction_type = 'receita' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'despesa' AND _tx.account_id IS NOT NULL THEN
    UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
      WHERE id = _tx.account_id;
  ELSIF _tx.transaction_type = 'transferencia' THEN
    IF _tx.account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance - (_sign * _tx.amount)
        WHERE id = _tx.account_id;
    END IF;
    IF _tx.destination_account_id IS NOT NULL THEN
      UPDATE public.accounts SET current_balance = current_balance + (_sign * _tx.amount)
        WHERE id = _tx.destination_account_id;
    END IF;
  END IF;
END $$;

-- 2) Suíte SQL do motor de saldos
CREATE OR REPLACE FUNCTION public._test_balance_engine()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u_owner  uuid := '44444444-bbbb-4bbb-8bbb-000000000001';
  u_other  uuid := '44444444-bbbb-4bbb-8bbb-000000000002';
  a_pf     uuid := '55555555-bbbb-4bbb-8bbb-000000000001';
  tx1      uuid;
  tx2      uuid;
  denied   boolean;
  drift_ct integer;
BEGIN
  PERFORM set_config('app.balance_engine', 'on', true);
  DELETE FROM public.transactions WHERE account_id = a_pf;
  DELETE FROM public.accounts     WHERE id = a_pf;
  PERFORM set_config('app.balance_engine', '', true);
  DELETE FROM auth.users WHERE id IN (u_owner, u_other);

  INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at) VALUES
    (u_owner, '00000000-0000-0000-0000-000000000000', 'test-bal-owner@authz.local', 'authenticated','authenticated', now(), now()),
    (u_other, '00000000-0000-0000-0000-000000000000', 'test-bal-other@authz.local', 'authenticated','authenticated', now(), now());

  PERFORM set_config('app.balance_engine', 'on', true);
  INSERT INTO public.accounts (id, user_id, name, account_type, context, initial_balance, current_balance)
  VALUES (a_pf, u_owner, 'BalEng PF', 'corrente', 'pf', 100, 100);
  PERFORM set_config('app.balance_engine', '', true);

  -- Caso 1: happy path — 100 -> 250 (delta +150 → receita)
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  SELECT public.adjust_account_balance(a_pf, 250, current_date, 'divergencia extrato', 'idem-1')
    INTO tx1;
  IF tx1 IS NULL THEN RAISE EXCEPTION 'CASO 1: rpc retornou null'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.transactions
     WHERE id = tx1
       AND is_balance_adjustment = true
       AND adjustment_idempotency_key = 'idem-1'
       AND transaction_type = 'receita'
       AND amount = 150
  ) THEN
    RAISE EXCEPTION 'CASO 1: transacao de ajuste incorreta';
  END IF;
  IF (SELECT current_balance FROM public.accounts WHERE id = a_pf) <> 250 THEN
    RAISE EXCEPTION 'CASO 1: current_balance nao atualizou (esperava 250, obteve %)',
      (SELECT current_balance FROM public.accounts WHERE id = a_pf);
  END IF;

  -- Caso 2: idempotência
  SELECT public.adjust_account_balance(a_pf, 999, current_date, 'ignorada', 'idem-1') INTO tx2;
  IF tx2 <> tx1 THEN
    RAISE EXCEPTION 'CASO 2: idempotencia falhou (tx1=% tx2=%)', tx1, tx2;
  END IF;
  IF (SELECT count(*) FROM public.transactions WHERE adjustment_idempotency_key = 'idem-1') <> 1 THEN
    RAISE EXCEPTION 'CASO 2: mais de uma transacao com a mesma idem key';
  END IF;

  -- Caso 3: justificativa vazia
  denied := false;
  BEGIN
    PERFORM public.adjust_account_balance(a_pf, 500, current_date, '   ', 'idem-2');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%justificativa%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 3: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 3: aceitou justificativa vazia'; END IF;

  -- Caso 4: delta zero
  denied := false;
  BEGIN
    PERFORM public.adjust_account_balance(a_pf,
      (SELECT current_balance FROM public.accounts WHERE id = a_pf),
      current_date, 'sem delta', 'idem-3');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%igual ao saldo atual%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 4: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 4: aceitou delta zero'; END IF;

  -- Caso 5: terceiro não pode
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM public.adjust_account_balance(a_pf, 700, current_date, 'invasor', 'idem-4');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission denied%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 5: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 5: terceiro conseguiu ajustar'; END IF;

  -- Caso 6: guard bloqueia UPDATE direto sem GUC
  PERFORM set_config('app.balance_engine', '', true);
  denied := false;
  BEGIN
    UPDATE public.accounts SET current_balance = current_balance + 1 WHERE id = a_pf;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%motor financeiro%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 6: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 6: guard permitiu UPDATE direto'; END IF;

  -- Caso 7: guard permite UPDATE com GUC ligado
  PERFORM set_config('app.balance_engine', 'on', true);
  UPDATE public.accounts SET current_balance = current_balance + 1 WHERE id = a_pf;
  PERFORM set_config('app.balance_engine', '', true);

  -- Caso 8: report_balance_drift detecta divergência
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  PERFORM set_config('app.balance_engine', 'on', true);
  UPDATE public.accounts SET current_balance = current_balance + 999999 WHERE id = a_pf;
  PERFORM set_config('app.balance_engine', '', true);
  SELECT count(*) INTO drift_ct
    FROM public.report_balance_drift() d
   WHERE d.account_id = a_pf;
  IF drift_ct = 0 THEN
    RAISE EXCEPTION 'CASO 8: report_balance_drift nao detectou divergencia';
  END IF;

  -- cleanup
  PERFORM set_config('app.balance_engine', 'on', true);
  DELETE FROM public.transactions WHERE account_id = a_pf;
  DELETE FROM public.accounts     WHERE id = a_pf;
  PERFORM set_config('app.balance_engine', '', true);
  DELETE FROM auth.users WHERE id IN (u_owner, u_other);

  RETURN 'ok: 8 casos do motor de saldos passaram';
END $$;

REVOKE ALL ON FUNCTION public._test_balance_engine() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_balance_engine() TO service_role;

SELECT public._test_balance_engine();

-- 3) Helpers e2e
CREATE OR REPLACE FUNCTION public._e2e_seed_adjust_balance(_account_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id  uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM set_config('app.balance_engine', 'on', true);
  INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance)
  VALUES (_uid, _account_name, 'corrente', 'pf', 100, 100)
  RETURNING id INTO _id;
  PERFORM set_config('app.balance_engine', '', true);
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public._e2e_seed_adjust_balance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_seed_adjust_balance(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._e2e_cleanup_adjust_balance(_account_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM set_config('app.balance_engine', 'on', true);
  DELETE FROM public.transactions
   WHERE user_id = _uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = _uid AND name = _account_name);
  DELETE FROM public.accounts WHERE user_id = _uid AND name = _account_name;
  PERFORM set_config('app.balance_engine', '', true);
END $$;

REVOKE ALL ON FUNCTION public._e2e_cleanup_adjust_balance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_adjust_balance(text) TO authenticated, service_role;
