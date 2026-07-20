-- Fase 2: alocação automática de transações à fatura correta

-- 1. Recalcula os totais materializados de uma fatura a partir das transações vinculadas.
CREATE OR REPLACE FUNCTION public.recalc_credit_card_invoice_totals(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchases    numeric(15,2) := 0;
  v_installments numeric(15,2) := 0;
  v_credits      numeric(15,2) := 0;
  v_previous     numeric(15,2);
  v_interest     numeric(15,2);
  v_fees         numeric(15,2);
  v_paid         numeric(15,2);
BEGIN
  SELECT
    COALESCE(SUM(CASE
      WHEN t.transaction_type = 'despesa'
       AND COALESCE(t.installment_total, 1) <= 1
       AND t.is_invoice_payment = false
      THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN t.transaction_type = 'despesa'
       AND COALESCE(t.installment_total, 1) > 1
       AND t.parent_transaction_id IS NOT NULL
      THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN t.transaction_type = 'receita'
      THEN t.amount ELSE 0 END), 0)
  INTO v_purchases, v_installments, v_credits
  FROM public.transactions t
  WHERE t.credit_card_invoice_id = _invoice_id
    AND COALESCE(t.status, 'confirmado') <> 'cancelado';

  SELECT previous_balance, total_interest, total_fees, paid_amount
    INTO v_previous, v_interest, v_fees, v_paid
  FROM public.credit_card_invoices WHERE id = _invoice_id;

  UPDATE public.credit_card_invoices
     SET total_purchases    = v_purchases,
         total_installments = v_installments,
         total_credits      = v_credits,
         total_amount       = COALESCE(v_previous,0) + v_purchases + v_installments
                              + COALESCE(v_interest,0) + COALESCE(v_fees,0)
                              - v_credits - COALESCE(v_paid,0),
         updated_at         = now()
   WHERE id = _invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_credit_card_invoice_totals(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_credit_card_invoice_totals(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.recalc_credit_card_invoice_totals(uuid) TO authenticated, service_role;

-- 2. Aloca uma transação à fatura correta (cria fatura se necessário).
CREATE OR REPLACE FUNCTION public.assign_transaction_to_invoice(_transaction_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx           public.transactions%ROWTYPE;
  v_acc          public.accounts%ROWTYPE;
  v_card         public.credit_cards%ROWTYPE;
  v_closing      date;
  v_next_closing date;
  v_ref_year     int;
  v_ref_month    int;
  v_period_start date;
  v_due          date;
  v_invoice_id   uuid;
  v_old_invoice  uuid;
BEGIN
  SELECT * INTO v_tx FROM public.transactions WHERE id = _transaction_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Pagamentos de fatura não são alocados (movimento de caixa, não de crédito).
  IF v_tx.is_invoice_payment THEN RETURN NULL; END IF;

  SELECT * INTO v_acc FROM public.accounts WHERE id = v_tx.account_id;
  IF NOT FOUND OR v_acc.account_type <> 'cartao_credito' THEN
    -- Se saiu de uma conta de cartão, limpa vínculo antigo.
    v_old_invoice := v_tx.credit_card_invoice_id;
    IF v_old_invoice IS NOT NULL THEN
      UPDATE public.transactions SET credit_card_invoice_id = NULL WHERE id = _transaction_id;
      PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE account_id = v_acc.id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Resolve o fechamento do mês da compra.
  v_ref_year  := EXTRACT(YEAR FROM v_tx.transaction_date)::int;
  v_ref_month := EXTRACT(MONTH FROM v_tx.transaction_date)::int;
  v_closing   := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.closing_day);

  -- Compra após o fechamento → avança um mês.
  IF v_tx.transaction_date > v_closing THEN
    v_ref_month := v_ref_month + 1;
    IF v_ref_month > 12 THEN
      v_ref_month := 1;
      v_ref_year  := v_ref_year + 1;
    END IF;
    v_closing := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.closing_day);
  END IF;

  -- Vencimento: se due_day > closing_day → mesmo mês; senão → próximo.
  IF v_card.due_day > v_card.closing_day THEN
    v_due := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.due_day);
  ELSE
    IF v_ref_month = 12 THEN
      v_due := private.resolve_cycle_date(v_ref_year + 1, 1, v_card.due_day);
    ELSE
      v_due := private.resolve_cycle_date(v_ref_year, v_ref_month + 1, v_card.due_day);
    END IF;
  END IF;

  -- Período: dia seguinte ao fechamento do mês anterior.
  IF v_ref_month = 1 THEN
    v_period_start := private.resolve_cycle_date(v_ref_year - 1, 12, v_card.closing_day) + 1;
  ELSE
    v_period_start := private.resolve_cycle_date(v_ref_year, v_ref_month - 1, v_card.closing_day) + 1;
  END IF;

  -- UPSERT da fatura.
  INSERT INTO public.credit_card_invoices (
    credit_card_id, company_id, user_id,
    reference_month, period_start, closing_date, due_date, status
  ) VALUES (
    v_card.id, v_card.company_id, v_card.user_id,
    make_date(v_ref_year, v_ref_month, 1),
    v_period_start, v_closing, v_due,
    CASE WHEN v_closing < CURRENT_DATE THEN 'fechada'::public.invoice_cycle_status
         ELSE 'aberta'::public.invoice_cycle_status END
  )
  ON CONFLICT (credit_card_id, reference_month) DO UPDATE
    SET period_start = EXCLUDED.period_start,
        closing_date = EXCLUDED.closing_date,
        due_date     = EXCLUDED.due_date
  RETURNING id INTO v_invoice_id;

  v_old_invoice := v_tx.credit_card_invoice_id;

  IF v_old_invoice IS DISTINCT FROM v_invoice_id THEN
    UPDATE public.transactions
       SET credit_card_invoice_id = v_invoice_id
     WHERE id = _transaction_id;
  END IF;

  -- Recalcula totais da nova fatura (e da antiga, se mudou).
  PERFORM public.recalc_credit_card_invoice_totals(v_invoice_id);
  IF v_old_invoice IS NOT NULL AND v_old_invoice <> v_invoice_id THEN
    PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_transaction_to_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_transaction_to_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_transaction_to_invoice(uuid) TO authenticated, service_role;

-- 3. Trigger que dispara a alocação automaticamente.
CREATE OR REPLACE FUNCTION public.tg_transactions_assign_cc_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_type public.account_type;
  v_old_invoice  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.credit_card_invoice_id IS NOT NULL THEN
      PERFORM public.recalc_credit_card_invoice_totals(OLD.credit_card_invoice_id);
    END IF;
    RETURN OLD;
  END IF;

  -- Pagamentos de fatura são ignorados (não geram alocação).
  IF NEW.is_invoice_payment THEN
    RETURN NEW;
  END IF;

  SELECT account_type INTO v_account_type FROM public.accounts WHERE id = NEW.account_id;

  IF v_account_type = 'cartao_credito' THEN
    PERFORM public.assign_transaction_to_invoice(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.credit_card_invoice_id IS NOT NULL THEN
    -- Saiu de um cartão: limpa vínculo e recalcula fatura antiga.
    v_old_invoice := OLD.credit_card_invoice_id;
    UPDATE public.transactions SET credit_card_invoice_id = NULL WHERE id = NEW.id;
    PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_assign_cc_invoice ON public.transactions;
CREATE TRIGGER trg_transactions_assign_cc_invoice
  AFTER INSERT OR UPDATE OF transaction_date, amount, account_id, status, installment_total, parent_transaction_id
  OR DELETE
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_transactions_assign_cc_invoice();