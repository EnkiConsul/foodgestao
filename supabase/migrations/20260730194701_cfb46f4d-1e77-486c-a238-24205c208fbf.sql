DO $do$
DECLARE
  r record;
  d text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY (ARRAY[
         'adjust_account_balance','apply_tx_balance','auto_promote_open_finance_raw',
         'categorize_transactions_batch','chart_accounts_ledger','chart_accounts_pending_classification',
         'chart_accounts_report','dp_folha_gerar_despesa','dre_apply_default_mapping','get_balance_before',
         'pay_credit_card_invoice','plin_ia_cashflow','plin_ia_summary','pluggy_confirm_staging',
         'promote_open_finance_transactions','recalc_credit_card_invoice_totals','recompute_account_balance',
         'report_balance_drift','_e2e_seed_delete_accounts','_e2e_seed_foreign_accounts',
         '_test_balance_engine','_test_delete_account_authz'
       ])
  LOOP
    d := pg_get_functiondef(r.oid);

    -- casts explícitos
    d := replace(d, '''receita''::transaction_type',        '''entrada''::transaction_type');
    d := replace(d, '''despesa''::transaction_type',        '''saida''::transaction_type');
    d := replace(d, '''parcelado''::transaction_type',      '''parcelamento''::transaction_type');
    d := replace(d, '''receita''::public.transaction_type', '''entrada''::public.transaction_type');
    d := replace(d, '''despesa''::public.transaction_type', '''saida''::public.transaction_type');

    -- comparações com a coluna transaction_type
    d := regexp_replace(d, '(transaction_type\s*(?:=|<>)\s*)''receita''',   '\1''entrada''', 'g');
    d := regexp_replace(d, '(transaction_type\s*(?:=|<>)\s*)''despesa''',   '\1''saida''', 'g');
    d := regexp_replace(d, '(transaction_type\s*(?:=|<>)\s*)''parcelado''', '\1''parcelamento''', 'g');

    -- listas IN
    d := replace(d, 'transaction_type IN (''receita'',''despesa'')',  'transaction_type IN (''entrada'',''saida'')');
    d := replace(d, 'transaction_type IN (''receita'', ''despesa'')', 'transaction_type IN (''entrada'', ''saida'')');

    -- casos posicionais (INSERT ... VALUES)
    d := replace(d, 'WHEN ''receita'' THEN ''entrada''', 'WHEN ''entrada'' THEN ''entrada''');
    d := replace(d, 'WHEN ''despesa'' THEN ''saida''',   'WHEN ''saida'' THEN ''saida''');
    d := replace(d, '''pj'', ''despesa'',',              '''pj'', ''saida'',');
    d := replace(d, '_payment_account_id, ''despesa'',', '_payment_account_id, ''saida'',');
    d := replace(d, 'v_interest_cat, ''despesa'',',      'v_interest_cat, ''saida'',');
    d := replace(d, 'ctx, ''receita'', ''e2e seed''',    'ctx, ''entrada'', ''e2e seed''');
    d := replace(d, '''pf'', ''receita'', ''e2e foreign seed''', '''pf'', ''entrada'', ''e2e foreign seed''');
    d := replace(d, '''pf'', ''receita'', ''seed''',     '''pf'', ''entrada'', ''seed''');

    IF d ~ '''(receita|despesa|parcelado)''' THEN
      RAISE EXCEPTION 'valor antigo remanescente na funcao %', r.proname;
    END IF;

    EXECUTE d;
  END LOOP;
END
$do$;

-- simplifica o mapeamento redundante em categorize_transactions_batch
CREATE OR REPLACE FUNCTION public.categorize_transactions_batch(p_limit integer DEFAULT 500, p_min_confidence numeric DEFAULT 0.7, p_context text DEFAULT NULL::text, p_company_id uuid DEFAULT NULL::uuid, p_only_uncategorized boolean DEFAULT true)
 RETURNS TABLE(scanned integer, updated integer, skipped_low_confidence integer, skipped_no_match integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scanned int := 0;
  v_updated int := 0;
  v_low int := 0;
  v_none int := 0;
  r record;
  s record;
  v_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  FOR r IN
    SELECT id, description, transaction_type, context, company_id
      FROM public.transactions
     WHERE user_id = v_uid
       AND description IS NOT NULL
       AND length(trim(description)) > 0
       AND (NOT p_only_uncategorized OR category_id IS NULL)
       AND (p_context IS NULL OR context = p_context)
       AND (p_company_id IS NULL OR company_id = p_company_id)
     ORDER BY created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    v_scanned := v_scanned + 1;

    v_type := r.transaction_type::text;

    SELECT * INTO s FROM public.categorize_transaction(
      r.description, v_type, r.context, r.company_id, v_uid, 0.45
    ) LIMIT 1;

    IF s.category_id IS NULL THEN
      v_none := v_none + 1;
      CONTINUE;
    END IF;

    IF s.confidence < p_min_confidence THEN
      v_low := v_low + 1;
      CONTINUE;
    END IF;

    UPDATE public.transactions
       SET category_id = s.category_id,
           payment_method_id = COALESCE(payment_method_id, s.payment_method_id)
     WHERE id = r.id
       AND user_id = v_uid
       AND (NOT p_only_uncategorized OR category_id IS NULL);

    IF FOUND THEN
      v_updated := v_updated + 1;
      PERFORM public.increment_rule_hit(s.rule_id);
    END IF;
  END LOOP;

  scanned := v_scanned;
  updated := v_updated;
  skipped_low_confidence := v_low;
  skipped_no_match := v_none;
  RETURN NEXT;
END;
$function$;