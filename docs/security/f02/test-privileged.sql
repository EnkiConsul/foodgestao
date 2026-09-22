-- Staging only; transaction and ledger entries are rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','54f6ace3-349a-4861-877e-2d19995e2cf0',true);
DO $test$
DECLARE tid uuid; receipt jsonb; bal numeric; drift_count int;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id='69ff6260-eec0-4182-bce0-a3c4522463cc' AND name='F01-20260922-A') THEN RAISE EXCEPTION 'Staging fixture absent'; END IF;
 INSERT INTO public.transactions(user_id,company_id,context,account_id,transaction_type,amount,status,transaction_date,description)
 VALUES('54f6ace3-349a-4861-877e-2d19995e2cf0','69ff6260-eec0-4182-bce0-a3c4522463cc','pj','ba37ad49-3325-445f-8253-21f39885e6a2','saida',100,'pendente','2026-09-22','F02 SQL rollback') RETURNING id INTO tid;
 receipt:=public.record_transaction_payment(tid,40,'2026-09-22','ba37ad49-3325-445f-8253-21f39885e6a2',gen_random_uuid(),NULL);
 bal:=public.recompute_account_balance('ba37ad49-3325-445f-8253-21f39885e6a2');
 IF bal<>-40 THEN RAISE EXCEPTION 'Partial recomputation wrong: %',bal; END IF;
 SELECT count(*) INTO drift_count FROM public.report_balance_drift() WHERE account_id='ba37ad49-3325-445f-8253-21f39885e6a2';
 IF drift_count<>0 THEN RAISE EXCEPTION 'False balance drift'; END IF;
 PERFORM public.sync_of_account_balance('ba37ad49-3325-445f-8253-21f39885e6a2',999);
 SELECT current_balance INTO bal FROM public.accounts WHERE id='ba37ad49-3325-445f-8253-21f39885e6a2';
 IF bal<>-40 THEN RAISE EXCEPTION 'Bank sync overwrote partial cash'; END IF;
 PERFORM public.reverse_transaction_payment(tid,(receipt->>'payment_id')::uuid,'2026-09-22',gen_random_uuid(),'SQL test reversal');
 bal:=public.recompute_account_balance('ba37ad49-3325-445f-8253-21f39885e6a2');
 IF bal<>0 THEN RAISE EXCEPTION 'Reversal recomputation wrong: %',bal; END IF;
 -- Ledger is append-only even for privileged updates.
 BEGIN UPDATE public.transaction_payments SET amount=99 WHERE transaction_id=tid;
 RAISE EXCEPTION 'Privileged history edit accepted';
 EXCEPTION WHEN check_violation THEN
 IF SQLERRM<>'Histórico imutável; registre um estorno' THEN RAISE; END IF;
 END;
END $test$;
ROLLBACK;
SELECT 'passed' result,5 checks,'all writes rolled back' effects;
