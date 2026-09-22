-- Execute only on staging utjhzpdbqzajrhnzcher. All writes are rolled back.
BEGIN;
DO $test$
DECLARE t public.transactions%ROWTYPE; before_balance numeric; after_balance numeric; n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id='69ff6260-eec0-4182-bce0-a3c4522463cc' AND name='F01-20260922-A') THEN
    RAISE EXCEPTION 'Synthetic fixture missing'; END IF;
  SELECT current_balance INTO before_balance FROM public.accounts WHERE id='ef162c79-722d-4de7-b69c-921c5093dafc';
  t.context:='pj'; t.company_id:='69ff6260-eec0-4182-bce0-a3c4522463cc'; t.user_id:='54f6ace3-349a-4861-877e-2d19995e2cf0';
  t.account_id:='ef162c79-722d-4de7-b69c-921c5093dafc'; t.status:='confirmado'; t.transaction_type:='entrada'; t.amount:=7;
  BEGIN
    PERFORM public.apply_tx_balance(t,1);
    RAISE EXCEPTION 'Privileged balance engine accepted cross-company source';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Conta ou cartão não pertence ao contexto do lançamento' THEN RAISE; END IF;
  END;
  SELECT current_balance INTO after_balance FROM public.accounts WHERE id='ef162c79-722d-4de7-b69c-921c5093dafc';
  IF before_balance IS DISTINCT FROM after_balance THEN RAISE EXCEPTION 'Balance changed'; END IF;
  -- Bypass table grants as database owner so these tests actually reach the trigger.
  BEGIN
    UPDATE public.accounts SET company_id='bf43c3b4-28d8-4290-8abd-627185485059' WHERE id='ba37ad49-3325-445f-8253-21f39885e6a2';
    RAISE EXCEPTION 'Account tenant change accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Empresa e contexto%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.accounts SET context='pf',company_id=NULL WHERE id='ba37ad49-3325-445f-8253-21f39885e6a2';
    RAISE EXCEPTION 'Account context change accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Empresa e contexto%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.accounts SET user_id='08ac0d25-6018-491f-8ca0-8c08f5e525a8' WHERE id='6794e6ea-db70-4ad1-b64c-9c970bba41aa';
    RAISE EXCEPTION 'PF owner change accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'Empresa e contexto%' THEN RAISE; END IF;
  END;
  UPDATE public.accounts SET name='F01 SQL renamed' WHERE id='ba37ad49-3325-445f-8253-21f39885e6a2';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Name update failed'; END IF;
  UPDATE public.credit_cards SET user_id='08ac0d25-6018-491f-8ca0-8c08f5e525a8' WHERE id='32dbf6f7-419a-45f9-aa2f-b02fd9eec14b';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'PJ authorship update failed'; END IF;
  IF has_function_privilege('authenticated','private.assert_financial_source_scope(public.context_type,uuid,uuid,uuid,uuid,uuid)','EXECUTE')
    OR has_function_privilege('authenticated','public.apply_tx_balance(public.transactions,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Unexpected client execute grant'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'passed' AS result, 7 AS checks, 'all writes rolled back' AS effects;
