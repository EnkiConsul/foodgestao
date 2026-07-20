
CREATE OR REPLACE FUNCTION public.pay_credit_card_invoice(
  _invoice_id uuid,
  _amount numeric,
  _payment_account_id uuid,
  _payment_date date DEFAULT CURRENT_DATE,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv           public.credit_card_invoices%ROWTYPE;
  v_card          public.credit_cards%ROWTYPE;
  v_next          public.credit_card_invoices%ROWTYPE;
  v_user          uuid := auth.uid();
  v_outstanding   numeric(15,2);
  v_new_paid      numeric(15,2);
  v_remainder     numeric(15,2);
  v_interest      numeric(15,2) := 0;
  v_pay_tx_id     uuid;
  v_interest_cat  uuid;
  v_new_status    public.invoice_cycle_status;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO v_inv FROM public.credit_card_invoices WHERE id = _invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice_not_found'; END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = v_inv.credit_card_id;

  IF v_inv.user_id <> v_user
     AND (v_inv.company_id IS NULL OR NOT public.is_company_member(v_inv.company_id, v_user)) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_inv.status = 'aberta'::public.invoice_cycle_status THEN
    RAISE EXCEPTION 'invoice_not_closed';
  END IF;

  v_outstanding := GREATEST(COALESCE(v_inv.total_amount,0) - COALESCE(v_inv.paid_amount,0), 0);
  IF v_outstanding <= 0 THEN RAISE EXCEPTION 'invoice_already_paid'; END IF;

  IF v_inv.payment_transaction_id IS NOT NULL THEN
    UPDATE public.transactions
       SET account_id     = _payment_account_id,
           amount         = _amount,
           amount_paid    = _amount,
           payment_date   = _payment_date,
           transaction_date = _payment_date,
           status         = 'confirmado',
           bill_status    = 'pago',
           notes          = COALESCE(_notes, notes),
           updated_at     = now()
     WHERE id = v_inv.payment_transaction_id
     RETURNING id INTO v_pay_tx_id;
  ELSE
    INSERT INTO public.transactions(
      user_id, company_id, context, account_id, transaction_type,
      description, amount, amount_paid, transaction_date, due_date, payment_date,
      status, bill_status, is_invoice_payment, credit_card_invoice_id, notes
    ) VALUES (
      v_inv.user_id, v_inv.company_id, v_card.context, _payment_account_id, 'despesa',
      'Pagamento fatura ' || COALESCE(v_card.issuer, v_card.brand, 'Cartão')
        || ' •••• ' || COALESCE(v_card.last4,''),
      _amount, _amount, _payment_date, v_inv.due_date, _payment_date,
      'confirmado', 'pago', true, v_inv.id, _notes
    ) RETURNING id INTO v_pay_tx_id;
  END IF;

  v_new_paid  := COALESCE(v_inv.paid_amount,0) + _amount;
  v_remainder := GREATEST(COALESCE(v_inv.total_amount,0) - v_new_paid, 0);
  v_new_status := (CASE WHEN v_remainder <= 0.005 THEN 'paga' ELSE 'parcial' END)::public.invoice_cycle_status;

  UPDATE public.credit_card_invoices
     SET paid_amount            = v_new_paid,
         payment_transaction_id = v_pay_tx_id,
         status                 = v_new_status,
         paid_at                = CASE WHEN v_new_status = 'paga'::public.invoice_cycle_status THEN now() ELSE paid_at END,
         updated_at             = now()
   WHERE id = v_inv.id;

  IF v_remainder > 0 THEN
    SELECT * INTO v_next
    FROM public.credit_card_invoices
    WHERE credit_card_id = v_inv.credit_card_id
      AND reference_month > v_inv.reference_month
    ORDER BY reference_month ASC LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.credit_card_invoices(
        credit_card_id, company_id, user_id, context,
        reference_month, period_start, closing_date, due_date, status, previous_balance
      ) VALUES (
        v_card.id, v_inv.company_id, v_inv.user_id, v_card.context,
        (v_inv.reference_month + interval '1 month')::date,
        (v_inv.closing_date + interval '1 day')::date,
        (private.resolve_cycle_date((v_inv.reference_month + interval '1 month')::date, v_card.closing_day))::date,
        (private.resolve_cycle_date((v_inv.reference_month + interval '1 month')::date, v_card.due_day))::date,
        'aberta'::public.invoice_cycle_status, v_remainder
      ) RETURNING * INTO v_next;
    ELSE
      UPDATE public.credit_card_invoices
         SET previous_balance = COALESCE(previous_balance,0) + v_remainder,
             updated_at = now()
       WHERE id = v_next.id
       RETURNING * INTO v_next;
    END IF;

    v_interest := ROUND(v_remainder * (COALESCE(v_card.interest_rate_monthly,0) / 100.0), 2);
    IF v_interest > 0 THEN
      SELECT id INTO v_interest_cat
      FROM public.categories
      WHERE (company_id = v_inv.company_id OR (v_inv.company_id IS NULL AND user_id = v_inv.user_id))
        AND transaction_type = 'despesa'
        AND (unaccent(lower(name)) LIKE '%despesa%financeir%'
             OR unaccent(lower(name)) LIKE '%juros%')
      ORDER BY CASE WHEN unaccent(lower(name)) LIKE '%juros%' THEN 0 ELSE 1 END
      LIMIT 1;

      UPDATE public.credit_card_invoices
         SET total_interest = COALESCE(total_interest,0) + v_interest,
             updated_at = now()
       WHERE id = v_next.id;

      INSERT INTO public.transactions(
        user_id, company_id, context, account_id, category_id, transaction_type,
        description, amount, transaction_date, due_date,
        status, credit_card_invoice_id, notes
      ) VALUES (
        v_inv.user_id, v_inv.company_id, v_card.context, v_card.account_id, v_interest_cat, 'despesa',
        'Juros rotativo — fatura ' || to_char(v_inv.reference_month, 'MM/YYYY'),
        v_interest, v_next.period_start, v_next.due_date,
        'confirmado', v_next.id,
        'Juros aplicados sobre saldo remanescente de R$ ' || v_remainder::text
      );
    END IF;

    PERFORM public.recalc_credit_card_invoice_totals(v_next.id);
  END IF;

  PERFORM public.recalc_credit_card_invoice_totals(v_inv.id);

  RETURN jsonb_build_object(
    'invoice_id', v_inv.id,
    'payment_transaction_id', v_pay_tx_id,
    'paid_amount', v_new_paid,
    'remainder', v_remainder,
    'interest_charged', v_interest,
    'status', v_new_status::text,
    'next_invoice_id', v_next.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_credit_card_invoice(uuid, numeric, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_credit_card_invoice(uuid, numeric, uuid, date, text) TO authenticated;
