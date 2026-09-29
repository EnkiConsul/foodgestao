CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging(
  p_staging_ids uuid[],
  p_account_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(staging_id uuid, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_row RECORD;
  v_tx_id UUID;
  v_tx_type public.transaction_type;
  v_amount NUMERIC(18,2);
  v_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT a.company_id INTO v_company
  FROM public.accounts a
  WHERE a.id = p_account_id AND a.is_active AND a.context = 'pj';
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_category_id AND c.is_active
      AND (c.company_id = v_company OR c.company_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'category_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    JOIN public.payment_methods pm ON pm.id = pmc.payment_method_id AND pm.is_active
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    JOIN public.contacts ct ON ct.id = cc.contact_id AND ct.is_active
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_staging_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO v_row
    FROM public.pluggy_staging_transactions s
    WHERE s.id = v_id AND s.company_id = v_company
    FOR UPDATE;

    IF v_row.id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.status = 'confirmed' THEN
      IF v_row.matched_transaction_id IS NOT NULL THEN
        staging_id := v_row.id;
        transaction_id := v_row.matched_transaction_id;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_row.status <> 'pending' THEN
      CONTINUE;
    END IF;

    v_amount := ABS(v_row.amount);
    v_tx_type := CASE WHEN v_row.amount >= 0 THEN 'entrada'::public.transaction_type
                      ELSE 'saida'::public.transaction_type END;

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_account_id, p_category_id,
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

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_card(
  p_staging_ids uuid[],
  p_credit_card_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(staging_id uuid, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
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
  WHERE c.id = p_credit_card_id AND c.context = 'pj' AND c.is_active;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'credit_card_not_found';
  END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN
    RAISE EXCEPTION 'credit_card_forbidden';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_category_id AND c.is_active
      AND (c.company_id = v_company OR c.company_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'category_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    JOIN public.payment_methods pm ON pm.id = pmc.payment_method_id AND pm.is_active
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    JOIN public.contacts ct ON ct.id = cc.contact_id AND ct.is_active
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_staging_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO v_row
    FROM public.pluggy_staging_transactions s
    WHERE s.id = v_id AND s.company_id = v_company
    FOR UPDATE;

    IF v_row.id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.status = 'confirmed' THEN
      IF v_row.matched_transaction_id IS NOT NULL THEN
        staging_id := v_row.id;
        transaction_id := v_row.matched_transaction_id;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_row.status <> 'pending' THEN
      CONTINUE;
    END IF;

    v_amount := ABS(v_row.amount);
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

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_transfer(
  p_staging_ids uuid[],
  p_account_id uuid,
  p_counterpart_account_id uuid
)
RETURNS TABLE(staging_id uuid, transaction_id uuid, mirror_staging_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
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

  SELECT a.company_id INTO v_company
  FROM public.accounts a WHERE a.id = p_account_id AND a.is_active AND a.context = 'pj';
  SELECT a.company_id INTO v_company_cp
  FROM public.accounts a WHERE a.id = p_counterpart_account_id AND a.is_active AND a.context = 'pj';
  IF v_company IS NULL OR v_company_cp IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF v_company IS DISTINCT FROM v_company_cp THEN
    RAISE EXCEPTION 'accounts_different_company';
  END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_staging_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO v_row
    FROM public.pluggy_staging_transactions s
    WHERE s.id = v_id AND s.company_id = v_company
    FOR UPDATE;

    IF v_row.id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.status = 'confirmed' THEN
      IF v_row.matched_transaction_id IS NOT NULL THEN
        staging_id := v_row.id;
        transaction_id := v_row.matched_transaction_id;
        mirror_staging_id := NULL;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_row.status <> 'pending' THEN
      CONTINUE;
    END IF;

    v_amount := ABS(v_row.amount);

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
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', v_origin, v_dest, NULL,
      'transferencia'::public.transaction_type, v_amount, v_amount,
      COALESCE(v_row.description, 'Transferência entre contas'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
    )
    RETURNING id INTO v_tx_id;

    UPDATE public.pluggy_staging_transactions
    SET status = 'confirmed', matched_transaction_id = v_tx_id, updated_at = now()
    WHERE id = v_row.id;

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
      WHERE id = v_mirror AND status = 'pending';
    END IF;

    staging_id := v_row.id;
    transaction_id := v_tx_id;
    mirror_staging_id := v_mirror;
    RETURN NEXT;
  END LOOP;

  PERFORM public.recompute_account_balance(p_account_id);
  PERFORM public.recompute_account_balance(p_counterpart_account_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_confirm_staging_transfer(
  p_staging_ids uuid[],
  p_origin_account_id uuid,
  p_destination_account_id uuid,
  p_category_id uuid DEFAULT NULL::uuid,
  p_payment_method_id uuid DEFAULT NULL::uuid,
  p_contact_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(staging_id uuid, transaction_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user UUID := auth.uid();
  v_id UUID;
  v_row RECORD;
  v_tx_id UUID;
  v_amount NUMERIC(18,2);
  v_company UUID;
  v_dest_company UUID;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT a.company_id INTO v_company
  FROM public.accounts a WHERE a.id = p_origin_account_id AND a.is_active AND a.context = 'pj';
  SELECT a.company_id INTO v_dest_company
  FROM public.accounts a WHERE a.id = p_destination_account_id AND a.is_active AND a.context = 'pj';

  IF v_company IS NULL OR v_dest_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF v_company <> v_dest_company THEN
    RAISE EXCEPTION 'accounts_must_belong_to_same_company';
  END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  IF p_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = p_category_id AND c.is_active
      AND (c.company_id = v_company OR c.company_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'category_forbidden';
  END IF;

  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    JOIN public.payment_methods pm ON pm.id = pmc.payment_method_id AND pm.is_active
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'payment_method_forbidden';
  END IF;

  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    JOIN public.contacts ct ON ct.id = cc.contact_id AND ct.is_active
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN
    RAISE EXCEPTION 'contact_forbidden';
  END IF;

  FOREACH v_id IN ARRAY COALESCE(p_staging_ids, ARRAY[]::uuid[]) LOOP
    SELECT * INTO v_row
    FROM public.pluggy_staging_transactions s
    WHERE s.id = v_id AND s.company_id = v_company
    FOR UPDATE;

    IF v_row.id IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.status = 'confirmed' THEN
      IF v_row.matched_transaction_id IS NOT NULL THEN
        staging_id := v_row.id;
        transaction_id := v_row.matched_transaction_id;
        RETURN NEXT;
      END IF;
      CONTINUE;
    END IF;

    IF v_row.status <> 'pending' THEN
      CONTINUE;
    END IF;

    v_amount := ABS(v_row.amount);

    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, destination_account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status,
      pluggy_staging_transaction_id, pluggy_transaction_id, pluggy_raw_snapshot,
      counterparty_name, counterparty_cnpj
    ) VALUES (
      v_user, v_row.company_id, 'pj', p_origin_account_id, p_destination_account_id, p_category_id,
      p_payment_method_id, p_contact_id,
      'transferencia'::public.transaction_type, v_amount, v_amount, COALESCE(v_row.description, 'Open Finance'),
      v_row.date, v_row.date, v_row.date,
      'confirmado'::public.transaction_status,
      v_row.id, v_row.pluggy_transaction_id, v_row.raw,
      v_row.counterparty_name, v_row.counterparty_document
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
$function$;

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

  SELECT a.company_id INTO v_company
  FROM public.accounts a WHERE a.id = p_account_id AND a.is_active AND a.context = 'pj';
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN
    RAISE EXCEPTION 'account_forbidden';
  END IF;

  SELECT * INTO v_row
  FROM public.pluggy_staging_transactions s
  WHERE s.id = p_staging_id AND s.company_id = v_company
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'staging_not_found';
  END IF;

  IF v_row.status = 'confirmed' THEN
    RETURN QUERY
      SELECT v_row.id, t.id
      FROM public.transactions t
      WHERE t.pluggy_staging_transaction_id = v_row.id
      ORDER BY t.created_at, t.id;
    RETURN;
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'staging_not_found';
  END IF;

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
      WHERE c.id = v_category AND c.is_active
        AND (c.company_id = v_company OR c.company_id IS NULL)
    ) THEN
      RAISE EXCEPTION 'category_forbidden';
    END IF;

    IF v_payment_method IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.payment_method_companies pmc
      JOIN public.payment_methods pm ON pm.id = pmc.payment_method_id AND pm.is_active
      WHERE pmc.payment_method_id = v_payment_method AND pmc.company_id = v_company
    ) THEN
      RAISE EXCEPTION 'payment_method_forbidden';
    END IF;

    IF v_contact IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.contact_companies cc
      JOIN public.contacts ct ON ct.id = cc.contact_id AND ct.is_active
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
END;
$function$;