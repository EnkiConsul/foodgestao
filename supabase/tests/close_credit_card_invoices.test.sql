-- Testes da rotina atômica de fechamento de faturas de cartão.
-- Execução: psql -f supabase/tests/close_credit_card_invoices.test.sql
-- Todo o teste roda em transação e é revertido no final.

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_account uuid;
  v_card uuid;
  v_inv uuid;
  v_card2 uuid;
  v_inv2 uuid;
  r record;
  v_count int;
  v_total numeric;
  v_min numeric;
  v_payable uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'sem usuarios: teste ignorado';
    RETURN;
  END IF;

  INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance)
  VALUES (v_user, 'TEST conta fechamento', 'corrente', 'pf', 0, 0)
  RETURNING id INTO v_account;

  -- Cartão com conta padrão de pagamento
  INSERT INTO public.credit_cards (user_id, name, context, closing_day, due_day,
                                   credit_limit, default_payment_account_id, minimum_payment_percent)
  VALUES (v_user, 'TEST cartao A', 'pf', 10, 20, 5000, v_account, 15)
  RETURNING id INTO v_card;

  INSERT INTO public.credit_card_invoices (credit_card_id, user_id, reference_month,
                                           period_start, closing_date, due_date, status)
  VALUES (v_card, v_user, date_trunc('month', CURRENT_DATE)::date,
          CURRENT_DATE - 40, CURRENT_DATE - 5, CURRENT_DATE + 5, 'aberta')
  RETURNING id INTO v_inv;

  INSERT INTO public.transactions (user_id, context, credit_card_id, credit_card_invoice_id,
                                   transaction_type, transaction_date, amount, description, status)
  VALUES (v_user, 'pf', v_card, v_inv, 'saida', CURRENT_DATE - 10, 200, 'TEST compra', 'confirmado');

  -- Cartão sem conta padrão de pagamento
  INSERT INTO public.credit_cards (user_id, name, context, closing_day, due_day,
                                   credit_limit, default_payment_account_id, minimum_payment_percent)
  VALUES (v_user, 'TEST cartao B', 'pf', 10, 5, 1000, NULL, 15)
  RETURNING id INTO v_card2;

  INSERT INTO public.credit_card_invoices (credit_card_id, user_id, reference_month,
                                           period_start, closing_date, due_date, status)
  VALUES (v_card2, v_user, date_trunc('month', CURRENT_DATE)::date,
          CURRENT_DATE - 40, CURRENT_DATE - 5, CURRENT_DATE + 5, 'aberta')
  RETURNING id INTO v_inv2;

  INSERT INTO public.transactions (user_id, context, credit_card_id, credit_card_invoice_id,
                                   transaction_type, transaction_date, amount, description, status)
  VALUES (v_user, 'pf', v_card2, v_inv2, 'saida', CURRENT_DATE - 10, 100, 'TEST compra B', 'confirmado');

  -- 1ª execução
  SELECT * INTO r FROM public.close_credit_card_invoices(500, CURRENT_DATE);
  IF r.closed < 2 THEN RAISE EXCEPTION 'esperado 2 faturas fechadas, obtido %', r.closed; END IF;
  IF r.payables < 1 THEN RAISE EXCEPTION 'esperado 1 conta a pagar, obtido %', r.payables; END IF;
  IF jsonb_array_length(r.errors) <> 0 THEN RAISE EXCEPTION 'erros inesperados: %', r.errors; END IF;

  SELECT total_amount, minimum_amount, payment_transaction_id
    INTO v_total, v_min, v_payable
    FROM public.credit_card_invoices WHERE id = v_inv;
  IF v_total <> 200 THEN RAISE EXCEPTION 'total esperado 200, obtido %', v_total; END IF;
  IF v_min <> 30 THEN RAISE EXCEPTION 'minimo esperado 30, obtido %', v_min; END IF;
  IF v_payable IS NULL THEN RAISE EXCEPTION 'conta a pagar nao vinculada'; END IF;

  -- cartão sem conta padrão: fecha sem conta a pagar
  IF EXISTS (SELECT 1 FROM public.transactions
              WHERE credit_card_invoice_id = v_inv2 AND is_invoice_payment) THEN
    RAISE EXCEPTION 'cartao sem conta padrao nao deveria gerar conta a pagar';
  END IF;

  -- próxima fatura aberta
  SELECT count(*) INTO v_count FROM public.credit_card_invoices
   WHERE credit_card_id = v_card AND status = 'aberta';
  IF v_count <> 1 THEN RAISE EXCEPTION 'esperada 1 proxima fatura aberta, obtido %', v_count; END IF;

  -- 2ª execução: idempotente para as faturas já fechadas
  SELECT * INTO r FROM public.close_credit_card_invoices(500, CURRENT_DATE);
  SELECT count(*) INTO v_count FROM public.transactions
   WHERE credit_card_invoice_id = v_inv AND is_invoice_payment;
  IF v_count <> 1 THEN RAISE EXCEPTION 'conta a pagar duplicada: %', v_count; END IF;

  RAISE NOTICE 'close_credit_card_invoices: OK';
END $$;

-- Permissão: authenticated não pode executar
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.close_credit_card_invoices(integer, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated nao deveria executar close_credit_card_invoices';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.close_credit_card_invoices(integer, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role deveria executar close_credit_card_invoices';
  END IF;
END $$;

ROLLBACK;
