-- Testes da rotina atômica de fechamento de faturas de cartão.
-- Execução: psql -f supabase/tests/close_credit_card_invoices.test.sql
-- Roda em transação e é revertido no final (nenhum dado permanece).
--
-- Cobre: fechamento + mínimo, conta a pagar criada e vinculada, cartão sem conta
-- padrão não gera conta a pagar, próxima fatura aberta, idempotência na 2ª execução
-- e privilégio restrito ao service_role.

BEGIN;

DO $$
DECLARE
  v_user uuid; v_account uuid; v_card uuid; v_inv uuid; v_card2 uuid; v_inv2 uuid;
  v_day date; r record; v_count int; v_total numeric; v_min numeric; v_payable uuid; v_status text;
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'sem usuarios: teste ignorado';
    RETURN;
  END IF;

  INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance)
  VALUES (v_user, 'TEST conta fechamento', 'corrente', 'pf', 0, 0) RETURNING id INTO v_account;

  -- Cartão A: com conta padrão de pagamento
  INSERT INTO public.credit_cards (user_id, brand, context, closing_day, due_day,
                                   credit_limit, default_payment_account_id, minimum_payment_percent)
  VALUES (v_user, 'TEST A', 'pf', 10, 20, 5000, v_account, 15) RETURNING id INTO v_card;

  -- A fatura é criada/atribuída pelo trigger de faturas
  INSERT INTO public.transactions (user_id, context, credit_card_id, transaction_type,
                                   transaction_date, amount, description, status)
  VALUES (v_user, 'pf', v_card, 'saida', CURRENT_DATE, 200, 'TEST compra', 'confirmado');
  SELECT id, closing_date + 1 INTO v_inv, v_day
    FROM public.credit_card_invoices
   WHERE credit_card_id = v_card AND total_amount > 0
   ORDER BY closing_date LIMIT 1;

  -- Cartão B: sem conta padrão de pagamento
  INSERT INTO public.credit_cards (user_id, brand, context, closing_day, due_day,
                                   credit_limit, default_payment_account_id, minimum_payment_percent)
  VALUES (v_user, 'TEST B', 'pf', 10, 20, 1000, NULL, 15) RETURNING id INTO v_card2;

  INSERT INTO public.transactions (user_id, context, credit_card_id, transaction_type,
                                   transaction_date, amount, description, status)
  VALUES (v_user, 'pf', v_card2, 'saida', CURRENT_DATE, 100, 'TEST compra B', 'confirmado');
  SELECT id INTO v_inv2 FROM public.credit_card_invoices
   WHERE credit_card_id = v_card2 AND total_amount > 0 ORDER BY closing_date LIMIT 1;

  -- 1ª execução
  SELECT * INTO r FROM public.close_credit_card_invoices(500, v_day);
  RAISE NOTICE 'run1 closed=% opened=% payables=% errors=%', r.closed, r.opened, r.payables, r.errors;
  IF jsonb_array_length(r.errors) <> 0 THEN RAISE EXCEPTION 'erros inesperados: %', r.errors; END IF;
  IF r.closed < 2 THEN RAISE EXCEPTION 'esperado 2 faturas fechadas, obtido %', r.closed; END IF;
  IF r.payables <> 1 THEN RAISE EXCEPTION 'esperado 1 conta a pagar, obtido %', r.payables; END IF;

  SELECT total_amount, minimum_amount, payment_transaction_id, status::text
    INTO v_total, v_min, v_payable, v_status
    FROM public.credit_card_invoices WHERE id = v_inv;
  IF v_total <> 200 THEN RAISE EXCEPTION 'total esperado 200, obtido %', v_total; END IF;
  IF v_min <> 30 THEN RAISE EXCEPTION 'minimo esperado 30, obtido %', v_min; END IF;
  IF v_payable IS NULL THEN RAISE EXCEPTION 'conta a pagar nao vinculada'; END IF;
  IF v_status <> 'fechada' THEN RAISE EXCEPTION 'status esperado fechada, obtido %', v_status; END IF;

  IF EXISTS (SELECT 1 FROM public.transactions
              WHERE credit_card_invoice_id = v_inv2 AND is_invoice_payment) THEN
    RAISE EXCEPTION 'cartao sem conta padrao nao deveria gerar conta a pagar';
  END IF;

  SELECT count(*) INTO v_count FROM public.credit_card_invoices
   WHERE credit_card_id = v_card AND status = 'aberta';
  IF v_count < 1 THEN RAISE EXCEPTION 'proxima fatura nao foi aberta'; END IF;

  -- 2ª execução: idempotente
  SELECT * INTO r FROM public.close_credit_card_invoices(500, v_day);
  RAISE NOTICE 'run2 closed=% payables=%', r.closed, r.payables;
  SELECT count(*) INTO v_count FROM public.transactions
   WHERE credit_card_invoice_id = v_inv AND is_invoice_payment;
  IF v_count <> 1 THEN RAISE EXCEPTION 'conta a pagar duplicada: %', v_count; END IF;

  -- Privilégios
  IF has_function_privilege('authenticated', 'public.close_credit_card_invoices(integer, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated nao deveria executar close_credit_card_invoices';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.close_credit_card_invoices(integer, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role deveria executar close_credit_card_invoices';
  END IF;

  RAISE NOTICE 'close_credit_card_invoices: OK';
END $$;

ROLLBACK;
