-- Índice de idempotência: uma única conta a pagar por fatura
CREATE UNIQUE INDEX IF NOT EXISTS transactions_invoice_payment_unique
  ON public.transactions (credit_card_invoice_id)
  WHERE is_invoice_payment AND credit_card_invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.close_credit_card_invoices(
  _limit integer DEFAULT 500,
  _today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(closed integer, opened integer, payables integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv         record;
  card        record;
  v_total     numeric(15,2);
  v_min       numeric(15,2);
  v_payable   uuid;
  v_next_ref  date;
  v_next_close date;
  v_next_due  date;
  v_next_start date;
  v_closed    int := 0;
  v_opened    int := 0;
  v_payables  int := 0;
  v_errors    jsonb := '[]'::jsonb;
BEGIN
  FOR inv IN
    SELECT i.id, i.credit_card_id, i.company_id, i.user_id, i.reference_month,
           i.closing_date, i.due_date
      FROM public.credit_card_invoices i
     WHERE i.status = 'aberta'
       AND i.closing_date < _today
     ORDER BY i.closing_date
     LIMIT GREATEST(COALESCE(_limit, 500), 1)
     FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT c.id, c.user_id, c.company_id, c.closing_day, c.due_day,
             c.default_payment_account_id, c.minimum_payment_percent
        INTO card
        FROM public.credit_cards c
       WHERE c.id = inv.credit_card_id;

      IF card.id IS NULL THEN
        v_errors := v_errors || jsonb_build_object('invoice_id', inv.id, 'error', 'credit card not found');
        CONTINUE;
      END IF;

      -- 1. Recalcula e lê os totais
      PERFORM public.recalc_credit_card_invoice_totals(inv.id);
      SELECT COALESCE(total_amount, 0) INTO v_total
        FROM public.credit_card_invoices WHERE id = inv.id;

      v_min := round(v_total * (COALESCE(card.minimum_payment_percent, 0) / 100.0), 2);

      -- 2. Fecha a fatura
      UPDATE public.credit_card_invoices
         SET status = 'fechada',
             minimum_amount = v_min,
             closed_at = now(),
             updated_at = now()
       WHERE id = inv.id
         AND status = 'aberta';

      IF NOT FOUND THEN
        CONTINUE; -- já fechada por outra execução
      END IF;
      v_closed := v_closed + 1;

      -- 3. Conta a pagar da fatura
      IF v_total > 0 AND card.default_payment_account_id IS NOT NULL THEN
        INSERT INTO public.transactions (
          user_id, company_id, context, account_id, transaction_type,
          transaction_date, due_date, amount, amount_paid, description,
          status, is_invoice_payment, credit_card_invoice_id
        )
        SELECT inv.user_id, inv.company_id,
               (CASE WHEN inv.company_id IS NULL THEN 'pf' ELSE 'pj' END)::context_type,
               card.default_payment_account_id, 'saida'::transaction_type,
               inv.due_date, inv.due_date, v_total, 0,
               'Fatura do cartão — ref. ' || to_char(inv.reference_month, 'YYYY-MM'),
               'pendente'::transaction_status, true, inv.id
         WHERE NOT EXISTS (
           SELECT 1 FROM public.transactions t
            WHERE t.credit_card_invoice_id = inv.id
              AND t.is_invoice_payment
         )
        RETURNING id INTO v_payable;

        IF v_payable IS NOT NULL THEN
          UPDATE public.credit_card_invoices
             SET payment_transaction_id = v_payable, updated_at = now()
           WHERE id = inv.id;
          v_payables := v_payables + 1;
        END IF;
      END IF;

      -- 4. Abre a próxima fatura
      v_next_ref := (date_trunc('month', inv.reference_month) + interval '1 month')::date;
      v_next_close := (date_trunc('month', v_next_ref)
                       + (LEAST(card.closing_day,
                                EXTRACT(DAY FROM (date_trunc('month', v_next_ref)
                                                  + interval '1 month - 1 day'))::int) - 1) * interval '1 day')::date;
      v_next_due := (
        SELECT (date_trunc('month', base)
                + (LEAST(card.due_day,
                         EXTRACT(DAY FROM (date_trunc('month', base) + interval '1 month - 1 day'))::int) - 1)
                  * interval '1 day')::date
          FROM (SELECT CASE WHEN card.due_day > card.closing_day
                            THEN v_next_ref
                            ELSE (v_next_ref + interval '1 month')::date END AS base) s
      );
      v_next_start := inv.closing_date + 1;

      INSERT INTO public.credit_card_invoices (
        credit_card_id, company_id, user_id, reference_month,
        period_start, closing_date, due_date, status
      ) VALUES (
        card.id, card.company_id, card.user_id, v_next_ref,
        v_next_start, v_next_close, v_next_due, 'aberta'
      )
      ON CONFLICT (credit_card_id, reference_month) DO NOTHING;

      IF FOUND THEN
        v_opened := v_opened + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object('invoice_id', inv.id, 'error', SQLERRM);
    END;
  END LOOP;

  RETURN QUERY SELECT v_closed, v_opened, v_payables, v_errors;
END;
$$;

REVOKE ALL ON FUNCTION public.close_credit_card_invoices(integer, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_credit_card_invoices(integer, date) FROM anon;
REVOKE ALL ON FUNCTION public.close_credit_card_invoices(integer, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_credit_card_invoices(integer, date) TO service_role;