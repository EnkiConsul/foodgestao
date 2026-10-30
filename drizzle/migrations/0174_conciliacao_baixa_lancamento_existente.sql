CREATE OR REPLACE FUNCTION public.pluggy_conciliacao_candidatos(p_company_id uuid, p_staging_ids uuid[])
 RETURNS TABLE(staging_id uuid, transaction_id uuid, description text, amount numeric, amount_paid numeric, due_date date, transaction_date date, account_id uuid, contact_id uuid, contact_name text, category_id uuid, installment_number integer, installment_total integer, is_recurring boolean, parent_transaction_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.pluggy_can_edit(auth.uid(), p_company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.id, t.id, t.description, t.amount, COALESCE(t.amount_paid, 0::numeric),
         t.due_date, t.transaction_date, t.account_id, t.contact_id, ct.name,
         t.category_id, t.installment_number, t.installment_total,
         COALESCE(t.is_recurring, false), t.parent_transaction_id
  FROM public.pluggy_staging_transactions s
  CROSS JOIN LATERAL (
    SELECT tx.* FROM public.transactions tx
    WHERE tx.company_id = p_company_id
      AND tx.status = 'pendente'
      AND tx.canceled_at IS NULL
      AND tx.credit_card_id IS NULL
      AND COALESCE(tx.is_invoice_payment, false) = false
      AND tx.pluggy_staging_transaction_id IS NULL
      AND tx.transaction_type = (CASE WHEN s.amount >= 0 THEN 'entrada' ELSE 'saida' END)::public.transaction_type
      AND ABS((tx.amount - COALESCE(tx.amount_paid, 0)) - ABS(s.amount)) < 0.005
    ORDER BY ABS(COALESCE(tx.due_date, tx.transaction_date) - s.date)
    LIMIT 8
  ) t
  LEFT JOIN public.contacts ct ON ct.id = t.contact_id
  WHERE s.company_id = p_company_id
    AND s.id = ANY(COALESCE(p_staging_ids, ARRAY[]::uuid[]))
    AND s.status = 'pending';
END;
$function$;

CREATE OR REPLACE FUNCTION public.pluggy_conciliacao_baixar(p_staging_id uuid, p_transaction_id uuid, p_account_id uuid, p_payment_method_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_s record;
  v_t record;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT a.company_id INTO v_company FROM public.accounts a
  WHERE a.id = p_account_id AND a.is_active AND a.context = 'pj';
  IF v_company IS NULL THEN RAISE EXCEPTION 'account_not_found'; END IF;
  IF NOT private.pluggy_can_edit(v_user, v_company) THEN RAISE EXCEPTION 'account_forbidden'; END IF;
  IF p_payment_method_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_method_companies pmc
    JOIN public.payment_methods pm ON pm.id = pmc.payment_method_id AND pm.is_active
    WHERE pmc.payment_method_id = p_payment_method_id AND pmc.company_id = v_company
  ) THEN RAISE EXCEPTION 'payment_method_forbidden'; END IF;
  IF p_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.contact_companies cc
    JOIN public.contacts ct ON ct.id = cc.contact_id AND ct.is_active
    WHERE cc.contact_id = p_contact_id AND cc.company_id = v_company
  ) THEN RAISE EXCEPTION 'contact_forbidden'; END IF;
  SELECT * INTO v_s FROM public.pluggy_staging_transactions st
  WHERE st.id = p_staging_id AND st.company_id = v_company FOR UPDATE;
  IF v_s.id IS NULL THEN RAISE EXCEPTION 'staging_not_found'; END IF;
  IF v_s.status = 'confirmed' AND v_s.matched_transaction_id = p_transaction_id THEN
    RETURN p_transaction_id;
  END IF;
  IF v_s.status <> 'pending' THEN RAISE EXCEPTION 'staging_not_pending'; END IF;
  SELECT * INTO v_t FROM public.transactions tr
  WHERE tr.id = p_transaction_id AND tr.company_id = v_company FOR UPDATE;
  IF v_t.id IS NULL THEN RAISE EXCEPTION 'transaction_not_found'; END IF;
  IF v_t.status <> 'pendente' OR v_t.canceled_at IS NOT NULL OR v_t.credit_card_id IS NOT NULL
     OR v_t.pluggy_staging_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'transaction_not_pending';
  END IF;
  IF v_t.transaction_type <> (CASE WHEN v_s.amount >= 0 THEN 'entrada' ELSE 'saida' END)::public.transaction_type THEN
    RAISE EXCEPTION 'type_mismatch';
  END IF;
  IF ABS((v_t.amount - COALESCE(v_t.amount_paid, 0)) - ABS(v_s.amount)) >= 0.005 THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;
  UPDATE public.transactions SET
    account_id = p_account_id,
    amount_paid = v_t.amount,
    payment_date = v_s.date,
    status = 'confirmado',
    bill_status = 'pago',
    payment_method_id = COALESCE(p_payment_method_id, v_t.payment_method_id),
    contact_id = COALESCE(v_t.contact_id, p_contact_id),
    pluggy_staging_transaction_id = v_s.id,
    pluggy_transaction_id = v_s.pluggy_transaction_id,
    pluggy_raw_snapshot = v_s.raw,
    counterparty_name = COALESCE(v_t.counterparty_name, v_s.counterparty_name),
    counterparty_cnpj = COALESCE(v_t.counterparty_cnpj, v_s.counterparty_document),
    updated_at = now()
  WHERE id = v_t.id;
  UPDATE public.pluggy_staging_transactions
  SET status = 'confirmed', matched_transaction_id = v_t.id, updated_at = now()
  WHERE id = v_s.id;
  RETURN v_t.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_conciliacao_candidatos(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pluggy_conciliacao_baixar(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_conciliacao_candidatos(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pluggy_conciliacao_baixar(uuid, uuid, uuid, uuid, uuid) TO authenticated, service_role;