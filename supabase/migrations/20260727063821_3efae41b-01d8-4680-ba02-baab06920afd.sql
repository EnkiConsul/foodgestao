CREATE OR REPLACE FUNCTION public._test_delete_account_hard_regression()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  a_empty uuid; a_pay uuid; a_guard uuid;
  cc uuid; inv uuid;
  res text;
  guarded boolean := false;
  still_exists boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  -- Contas PF isoladas para o teste.
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Empty-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Pay-'   || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_pay;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Guard-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_guard;

  -- Cartão + fatura pagando por a_pay (não deve afetar a_empty).
  INSERT INTO public.credit_cards(user_id, context, brand, last4, credit_limit,
                                  closing_day, due_day, default_payment_account_id,
                                  is_corporate, is_active)
    VALUES (uid,'pf','Visa','0000',1000,1,10,a_pay,false,true)
    RETURNING id INTO cc;
  INSERT INTO public.credit_card_invoices(credit_card_id, user_id, reference_month,
                                          period_start, closing_date, due_date)
    VALUES (cc, uid, date_trunc('month', current_date)::date,
            date_trunc('month', current_date)::date,
            (date_trunc('month', current_date) + interval '20 days')::date,
            (date_trunc('month', current_date) + interval '30 days')::date)
    RETURNING id INTO inv;

  -- CASO 1: a_empty NÃO é payment account e não tem tx → hard delete deve funcionar.
  res := public.delete_account(a_empty);
  IF res <> 'hard' THEN
    RAISE EXCEPTION 'regressão: esperava hard delete, obtive %', res;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.accounts WHERE id = a_empty) INTO still_exists;
  IF still_exists THEN
    RAISE EXCEPTION 'regressão: conta % ainda existe após hard delete', a_empty;
  END IF;

  -- CASO 2: aponta o cartão para a_guard → o trigger deve barrar hard delete
  -- (delete_account tenta hard porque não há transactions; trigger levanta exceção).
  UPDATE public.credit_cards SET default_payment_account_id = a_guard WHERE id = cc;
  BEGIN
    PERFORM public.delete_account(a_guard);
  EXCEPTION WHEN check_violation THEN
    guarded := true;
  END;
  IF NOT guarded THEN
    RAISE EXCEPTION 'regressão: trigger não barrou hard delete de conta ligada a cartão';
  END IF;

  -- Cleanup determinístico.
  DELETE FROM public.credit_card_invoices WHERE id = inv;
  DELETE FROM public.credit_cards WHERE id = cc;
  DELETE FROM public.accounts WHERE id IN (a_pay, a_guard);

  RETURN jsonb_build_object(
    'ok', true,
    'hard_delete_result', res,
    'guard_triggered', guarded
  );
END $$;

REVOKE ALL ON FUNCTION public._test_delete_account_hard_regression() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._test_delete_account_hard_regression() TO authenticated, service_role;