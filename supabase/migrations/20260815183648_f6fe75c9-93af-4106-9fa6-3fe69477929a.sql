CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_split(
  p_staging_id uuid,
  p_account_id uuid,
  p_splits jsonb
)
RETURNS TABLE(staging_id uuid, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_company UUID;
  v_row RECORD;
  v_split JSONB;
  v_tx_id UUID;
  v_first_tx_id UUID;
  v_tx_type public.transaction_type;
  v_amount NUMERIC(18,2);
  v_sum NUMERIC(18,2) := 0;
  v_count INT := 0;
  v_category UUID;
  v_payment_method UUID;
  v_contact UUID;
  v_description TEXT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_splits IS NULL OR jsonb_typeof(p_splits) <> 'array' THEN
    RAISE EXCEPTION 'invalid_splits';
  END IF;

  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_account_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company AND user_id = v_user) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  SELECT * INTO v_row
  FROM public.pluggy_staging_transactions
  WHERE id = p_staging_id
    AND company_id = v_company
    AND status = 'pending'
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'staging_not_found';
  END IF;

  -- valida partes e soma
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_amount := ROUND(ABS(COALESCE((v_split->>'amount')::NUMERIC, 0)), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_split_amount';
    END IF;
    v_sum := v_sum + v_amount;
    v_count := v_count + 1;

    v_payment_method := NULLIF(v_split->>'payment_method_id', '')::UUID;
    v_contact := NULLIF(v_split->>'contact_id', '')::UUID;
    v_category := NULLIF(v_split->>'category_id', '')::UUID;

    IF v_category IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = v_category
        AND (c.company_id = v_company OR c.company_id IS NULL)
    ) THEN
      RAISE EXCEPTION 'category_forbidden';
    END IF;

    IF v_payment_method IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payment_method_companies pmc
      WHERE pmc.payment_method_id = v_payment_method AND pmc.company_id = v_company
    ) THEN
      RAISE EXCEPTION 'payment_method_forbidden';
    END IF;

    IF v_contact IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contact_companies cc
      WHERE cc.contact_id = v_contact AND cc.company_id = v_company
    ) THEN
      RAISE EXCEPTION 'contact_forbidden';
    END IF;
  END LOOP;

  IF v_count < 2 THEN
    RAISE EXCEPTION 'split_requires_two_parts';
  END IF;

  IF ABS(v_sum - ROUND(ABS(v_row.amount), 2)) > 0.01 THEN
    RAISE EXCEPTION 'split_sum_mismatch';
  END IF;

  v_tx_type := CASE WHEN v_row.amount >= 0 THEN 'entrada'::public.transaction_type
                    ELSE 'saida'::public.transaction_type END;

  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    v_amount := ROUND(ABS((v_split->>'amount')::NUMERIC), 2);
    v_category := NULLIF(v_split->>'category_id', '')::UUID;
    v_payment_method := NULLIF(v_split->>'payment_method_id', '')::UUID;
    v_contact := NULLIF(v_split->>'contact_id', '')::UUID;
    v_description := NULLIF(TRIM(COALESCE(v_split->>'description', '')), '');

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_account_id, v_category,
      v_payment_method, v_contact,
      v_tx_type, v_amount, v_amount,
      COALESCE(v_description, v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
    )
    RETURNING id INTO v_tx_id;

    IF v_first_tx_id IS NULL THEN
      v_first_tx_id := v_tx_id;
    END IF;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;

  UPDATE public.pluggy_staging_transactions
  SET status = 'confirmed', matched_transaction_id = v_first_tx_id, updated_at = now()
  WHERE id = v_row.id;

  UPDATE public.pluggy_v2_transactions_raw
  SET confirmed_transaction_id = v_first_tx_id, updated_at = now()
  WHERE pluggy_transaction_id = v_row.pluggy_transaction_id
    AND company_id = v_row.company_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_confirm_staging_split(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging_split(uuid, uuid, jsonb) TO authenticated;