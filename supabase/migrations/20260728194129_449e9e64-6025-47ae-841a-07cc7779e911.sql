CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging(
  p_staging_ids UUID[],
  p_account_id UUID,
  p_category_id UUID DEFAULT NULL
) RETURNS TABLE(staging_id UUID, transaction_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_account_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = v_company AND user_id = v_user) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);
    v_tx_type := CASE WHEN v_row.amount >= 0 THEN 'receita'::public.transaction_type
                      ELSE 'despesa'::public.transaction_type END;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_account_id, p_category_id,
      v_tx_type, v_amount, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging(UUID[], UUID, UUID) TO authenticated;