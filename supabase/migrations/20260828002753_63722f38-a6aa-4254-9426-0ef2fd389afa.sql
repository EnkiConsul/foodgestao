CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_card(p_staging_ids uuid[], p_credit_card_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_payment_method_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(staging_id uuid, transaction_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_row RECORD;
  v_tx_id UUID;
  v_tx_type public.transaction_type;
  v_amount NUMERIC(18,2);
  v_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT c.company_id INTO v_company
  FROM public.credit_cards c
  WHERE c.id = p_credit_card_id AND c.context = 'pj';
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'credit_card_not_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = v_company AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'credit_card_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);
    -- Cartão de crédito no Open Finance usa convenção invertida:
    -- compra vem positiva com type DEBIT (saída); pagamento/estorno vem
    -- negativo com type CREDIT (entrada).
    v_tx_type := CASE
      WHEN upper(COALESCE(v_row.type,'')) = 'DEBIT' THEN 'saida'::public.transaction_type
      WHEN upper(COALESCE(v_row.type,'')) = 'CREDIT' THEN 'entrada'::public.transaction_type
      WHEN v_row.amount >= 0 THEN 'saida'::public.transaction_type
      ELSE 'entrada'::public.transaction_type END;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, credit_card_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', NULL, p_credit_card_id, p_category_id,
      p_payment_method_id, p_contact_id,
      v_tx_type, v_amount, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    UPDATE public.pluggy_v2_transactions_raw
    SET confirmed_transaction_id = v_tx_id, updated_at = now()
    WHERE pluggy_transaction_id = v_row.pluggy_transaction_id
      AND company_id = v_row.company_id;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;