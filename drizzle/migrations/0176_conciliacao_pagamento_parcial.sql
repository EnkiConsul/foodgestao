DROP FUNCTION IF EXISTS public.pluggy_conciliacao_baixar_ajuste(uuid, uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.pluggy_conciliacao_baixar_ajuste(p_staging_id uuid, p_transaction_id uuid, p_account_id uuid, p_payment_method_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid, p_diferenca_category_id uuid DEFAULT NULL::uuid, p_modo_menor text DEFAULT NULL::text)
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
  v_open numeric;
  v_pago numeric;
  v_diff numeric;
  v_nota text;
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

  v_open := v_t.amount - COALESCE(v_t.amount_paid, 0);
  v_pago := ABS(v_s.amount);
  v_diff := round(v_pago - v_open, 2);

  IF v_diff > 0 THEN
    IF p_diferenca_category_id IS NULL THEN RAISE EXCEPTION 'difference_category_required'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.categories c
      WHERE c.id = p_diferenca_category_id
        AND (c.company_id = v_company OR EXISTS (
          SELECT 1 FROM public.category_companies cc
          WHERE cc.category_id = c.id AND cc.company_id = v_company))
    ) THEN RAISE EXCEPTION 'category_forbidden'; END IF;
  END IF;

  IF v_diff < 0 AND COALESCE(p_modo_menor, '') NOT IN ('parcial', 'desconto') THEN
    RAISE EXCEPTION 'lesser_mode_required';
  END IF;

  IF v_diff < 0 AND p_modo_menor = 'parcial' THEN
    v_nota := format('Pagamento parcial de R$ %s na conciliação bancária em %s; saldo de R$ %s segue pendente em novo lançamento.',
      to_char(v_pago, 'FM999G999G990D00'), to_char(v_s.date, 'DD/MM/YYYY'), to_char(-v_diff, 'FM999G999G990D00'));
  ELSIF v_diff < 0 THEN
    v_nota := format('Desconto de R$ %s na conciliação bancária em %s (previsto R$ %s, pago R$ %s).',
      to_char(-v_diff, 'FM999G999G990D00'), to_char(v_s.date, 'DD/MM/YYYY'),
      to_char(v_open, 'FM999G999G990D00'), to_char(v_pago, 'FM999G999G990D00'));
  END IF;

  UPDATE public.transactions SET
    amount = CASE WHEN v_diff < 0 THEN COALESCE(v_t.amount_paid, 0) + v_pago ELSE v_t.amount END,
    amount_paid = CASE WHEN v_diff < 0 THEN COALESCE(v_t.amount_paid, 0) + v_pago ELSE v_t.amount END,
    account_id = p_account_id,
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
    notes = CASE WHEN v_nota IS NULL THEN v_t.notes ELSE concat_ws(E'\n', NULLIF(v_t.notes, ''), v_nota) END,
    updated_at = now()
  WHERE id = v_t.id;

  IF v_diff < 0 AND p_modo_menor = 'parcial' THEN
    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id, cost_center_id,
      payment_method_id, contact_id, transaction_type, amount, amount_paid, description,
      transaction_date, due_date, status, bill_status, installment_number, installment_total,
      parent_transaction_id, parcel_direction, counterparty_name, counterparty_cnpj, notes
    ) VALUES (
      v_t.user_id, v_company, v_t.context, v_t.account_id, v_t.category_id, v_t.cost_center_id,
      v_t.payment_method_id, v_t.contact_id, v_t.transaction_type, -v_diff, 0, v_t.description,
      v_t.transaction_date, v_t.due_date, 'pendente', v_t.bill_status, v_t.installment_number, v_t.installment_total,
      v_t.parent_transaction_id, v_t.parcel_direction, v_t.counterparty_name, v_t.counterparty_cnpj,
      format('Saldo restante após pagamento parcial conciliado em %s (lançamento %s).', to_char(v_s.date, 'DD/MM/YYYY'), v_t.id)
    );
  END IF;

  IF v_diff > 0 THEN
    INSERT INTO public.transactions (
      user_id, company_id, context, account_id, category_id,
      payment_method_id, contact_id,
      transaction_type, amount, amount_paid, description,
      transaction_date, payment_date, due_date, status, bill_status,
      counterparty_name, counterparty_cnpj, notes
    ) VALUES (
      v_user, v_company, 'pj', p_account_id, p_diferenca_category_id,
      COALESCE(p_payment_method_id, v_t.payment_method_id), COALESCE(v_t.contact_id, p_contact_id),
      v_t.transaction_type, v_diff, v_diff,
      'Diferença (juros/acréscimo): ' || COALESCE(v_t.description, 'lançamento'),
      v_s.date, v_s.date, v_s.date, 'confirmado', 'pago',
      COALESCE(v_t.counterparty_name, v_s.counterparty_name), COALESCE(v_t.counterparty_cnpj, v_s.counterparty_document),
      format('Diferença paga a maior na conciliação bancária, vinculada ao lançamento %s.', v_t.id)
    );
  END IF;

  UPDATE public.pluggy_staging_transactions
  SET status = 'confirmed', matched_transaction_id = v_t.id, updated_at = now()
  WHERE id = v_s.id;
  RETURN v_t.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pluggy_conciliacao_baixar_ajuste(uuid, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pluggy_conciliacao_baixar_ajuste(uuid, uuid, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;