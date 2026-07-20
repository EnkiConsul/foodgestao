
-- =========================================================
-- Fase 9.2: Cartão de crédito como entidade própria
-- =========================================================

-- 1) Nova coluna transactions.credit_card_id
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS credit_card_id uuid
    REFERENCES public.credit_cards(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_transactions_credit_card_id
  ON public.transactions(credit_card_id)
  WHERE credit_card_id IS NOT NULL;

-- 2) Backfill: transações que hoje apontam para a "conta-cartão" viram credit_card_id
UPDATE public.transactions t
SET credit_card_id = c.id,
    account_id     = NULL
FROM public.credit_cards c
WHERE t.account_id = c.account_id
  AND t.is_invoice_payment = false;

-- 3) Contas do tipo cartao_credito que ficaram órfãs (nenhum cartão apontando)
--    são convertidas para 'outro' para não confundir o usuário.
UPDATE public.accounts
   SET account_type = 'outro',
       updated_at   = now()
 WHERE account_type = 'cartao_credito'
   AND id NOT IN (SELECT account_id FROM public.credit_cards WHERE account_id IS NOT NULL);

-- 4) account_id passa a ser nullable + XOR
ALTER TABLE public.transactions
  ALTER COLUMN account_id DROP NOT NULL;

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_source_xor;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_xor
  CHECK ((account_id IS NULL) <> (credit_card_id IS NULL));

-- 5) Assert: nenhuma transação deve mais apontar para account_type='cartao_credito'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.account_id
    WHERE a.account_type = 'cartao_credito'
  ) THEN
    RAISE EXCEPTION 'Backfill incompleto: transações ainda apontam para conta-cartão';
  END IF;
END $$;

-- 6) Remove account_id de credit_cards (agora desnecessário)
ALTER TABLE public.credit_cards
  DROP COLUMN IF EXISTS account_id;

-- 7) Reescreve o motor de faturas para usar credit_card_id diretamente
CREATE OR REPLACE FUNCTION public.assign_transaction_to_invoice(_transaction_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx           public.transactions%ROWTYPE;
  v_card         public.credit_cards%ROWTYPE;
  v_closing      date;
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

  -- Sem cartão vinculado, limpa vínculo antigo e sai.
  IF v_tx.credit_card_id IS NULL THEN
    v_old_invoice := v_tx.credit_card_invoice_id;
    IF v_old_invoice IS NOT NULL THEN
      UPDATE public.transactions SET credit_card_invoice_id = NULL WHERE id = _transaction_id;
      PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO v_card FROM public.credit_cards WHERE id = v_tx.credit_card_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_ref_year  := EXTRACT(YEAR  FROM v_tx.transaction_date)::int;
  v_ref_month := EXTRACT(MONTH FROM v_tx.transaction_date)::int;
  v_closing   := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.closing_day);

  IF v_tx.transaction_date > v_closing THEN
    v_ref_month := v_ref_month + 1;
    IF v_ref_month > 12 THEN
      v_ref_month := 1;
      v_ref_year  := v_ref_year + 1;
    END IF;
    v_closing := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.closing_day);
  END IF;

  IF v_card.due_day > v_card.closing_day THEN
    v_due := private.resolve_cycle_date(v_ref_year, v_ref_month, v_card.due_day);
  ELSE
    IF v_ref_month = 12 THEN
      v_due := private.resolve_cycle_date(v_ref_year + 1, 1, v_card.due_day);
    ELSE
      v_due := private.resolve_cycle_date(v_ref_year, v_ref_month + 1, v_card.due_day);
    END IF;
  END IF;

  IF v_ref_month = 1 THEN
    v_period_start := private.resolve_cycle_date(v_ref_year - 1, 12, v_card.closing_day) + 1;
  ELSE
    v_period_start := private.resolve_cycle_date(v_ref_year, v_ref_month - 1, v_card.closing_day) + 1;
  END IF;

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

  PERFORM public.recalc_credit_card_invoice_totals(v_invoice_id);
  IF v_old_invoice IS NOT NULL AND v_old_invoice <> v_invoice_id THEN
    PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- 8) Trigger: usa credit_card_id em vez de consultar accounts.account_type
CREATE OR REPLACE FUNCTION public.tg_transactions_assign_cc_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_invoice uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.credit_card_invoice_id IS NOT NULL THEN
      PERFORM public.recalc_credit_card_invoice_totals(OLD.credit_card_invoice_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.is_invoice_payment THEN
    RETURN NEW;
  END IF;

  IF NEW.credit_card_id IS NOT NULL THEN
    PERFORM public.assign_transaction_to_invoice(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.credit_card_invoice_id IS NOT NULL THEN
    v_old_invoice := OLD.credit_card_invoice_id;
    UPDATE public.transactions SET credit_card_invoice_id = NULL WHERE id = NEW.id;
    PERFORM public.recalc_credit_card_invoice_totals(v_old_invoice);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transactions_assign_cc_invoice ON public.transactions;
CREATE TRIGGER trg_transactions_assign_cc_invoice
  AFTER INSERT OR UPDATE OF transaction_date, amount, credit_card_id, status, installment_total, parent_transaction_id
  OR DELETE
  ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_transactions_assign_cc_invoice();

-- 9) Visão unificada: nome/cor da origem (conta OU cartão)
CREATE OR REPLACE VIEW public.transaction_sources AS
SELECT
  t.id AS transaction_id,
  COALESCE(a.id, c.id) AS source_id,
  CASE WHEN a.id IS NOT NULL THEN 'account' ELSE 'credit_card' END AS source_kind,
  COALESCE(
    a.name,
    NULLIF(TRIM(COALESCE(c.brand,'') || ' ••••' || COALESCE(c.last4,'----')), '••••----')
  ) AS source_name,
  COALESCE(a.color, '#EB6119') AS source_color,
  COALESCE(a.bank_slug, LOWER(c.issuer)) AS source_slug
FROM public.transactions t
LEFT JOIN public.accounts     a ON a.id = t.account_id
LEFT JOIN public.credit_cards c ON c.id = t.credit_card_id;

GRANT SELECT ON public.transaction_sources TO authenticated, service_role;

-- 10) Documenta enum deprecated
COMMENT ON TYPE public.account_type IS
  'Valor "cartao_credito" está deprecated: cartões vivem em public.credit_cards. Mantido apenas por compatibilidade histórica.';

-- =========================================================
-- ROLLBACK MANUAL (não executar automaticamente):
-- 1. ALTER TABLE credit_cards ADD COLUMN account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
-- 2. Recriar contas 'cartao_credito' (nome derivado do cartão), popular credit_cards.account_id.
-- 3. UPDATE transactions t SET account_id = c.account_id, credit_card_id = NULL
--      FROM credit_cards c WHERE t.credit_card_id = c.id;
-- 4. Restaurar assign_transaction_to_invoice e trigger antigas; DROP CHECK transactions_source_xor;
--    ALTER COLUMN account_id SET NOT NULL; DROP VIEW transaction_sources.
-- =========================================================
