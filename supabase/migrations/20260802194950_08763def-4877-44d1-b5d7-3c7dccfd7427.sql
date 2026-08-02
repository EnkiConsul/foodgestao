CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_transfer(
  p_staging_ids UUID[],
  p_account_id UUID,
  p_counterpart_account_id UUID
) RETURNS TABLE(staging_id UUID, transaction_id UUID, mirror_staging_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_row RECORD;
  v_tx_id UUID;
  v_amount NUMERIC(18,2);
  v_company UUID;
  v_company_cp UUID;
  v_origin UUID;
  v_dest UUID;
  v_mirror UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_account_id IS NULL OR p_counterpart_account_id IS NULL THEN
    RAISE EXCEPTION 'accounts_required';
  END IF;
  IF p_account_id = p_counterpart_account_id THEN
    RAISE EXCEPTION 'same_account';
  END IF;

  SELECT a.company_id INTO v_company FROM public.accounts a WHERE a.id = p_account_id;
  SELECT a.company_id INTO v_company_cp FROM public.accounts a WHERE a.id = p_counterpart_account_id;
  IF v_company IS NULL OR v_company_cp IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF v_company IS DISTINCT FROM v_company_cp THEN
    RAISE EXCEPTION 'accounts_different_company';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE company_id = v_company AND user_id = v_user
  ) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  FOR v_row IN
    SELECT * FROM public.pluggy_staging_transactions
    WHERE id = ANY(p_staging_ids)
      AND status = 'pending'
      AND company_id = v_company
  LOOP
    v_amount := ABS(v_row.amount);

    -- valor negativo = saiu desta conta -> destino é a contraparte
    IF v_row.amount < 0 THEN
      v_origin := p_account_id;
      v_dest := p_counterpart_account_id;
    ELSE
      v_origin := p_counterpart_account_id;
      v_dest := p_account_id;
    END IF;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, destination_account_id, category_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status
    ) VALUES (
      v_user, v_row.company_id, 'pj', v_origin, v_dest, NULL,
      'transferencia'::public.transaction_type, v_amount, v_amount,
      COALESCE(v_row.description, 'Transferência entre contas'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

    -- perna espelho vinda do Open Finance da conta contraparte
    v_mirror := NULL;
    SELECT s.id INTO v_mirror
    FROM public.pluggy_staging_transactions s
    JOIN public.pluggy_accounts pa
      ON pa.pluggy_account_id = s.pluggy_account_id
     AND pa.company_id = s.company_id
    WHERE s.company_id = v_company
      AND s.status = 'pending'
      AND s.id <> v_row.id
      AND pa.linked_account_id = p_counterpart_account_id
      AND s.amount = -v_row.amount
      AND s.date BETWEEN v_row.date - 3 AND v_row.date + 3
    ORDER BY ABS(s.date - v_row.date)
    LIMIT 1;

    IF v_mirror IS NOT NULL THEN
      UPDATE public.pluggy_staging_transactions
      SET status = 'duplicate', matched_transaction_id = v_tx_id, updated_at = now()
      WHERE id = v_mirror;
    END IF;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    mirror_staging_id := v_mirror;
    RETURN NEXT;
  END LOOP;

  PERFORM public.recompute_account_balance(p_account_id);
  PERFORM public.recompute_account_balance(p_counterpart_account_id);
END;
$$;

REVOKE ALL ON FUNCTION public.pluggy_confirm_staging_transfer(UUID[], UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pluggy_confirm_staging_transfer(UUID[], UUID, UUID) TO authenticated;