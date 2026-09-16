-- Integridade de exclusão de cadastros financeiros (pendente de aplicação).
-- Só permite excluir forma de pagamento, centro de custo, contato, categoria e
-- conta contábil quando não houver nenhum lançamento vinculado.
-- Não altera RLS. Proteção de contas financeiras e cartões permanece intacta.
--
-- Rollback:
--   recriar as 4 FKs com ON DELETE SET NULL;
--   DROP TRIGGER trg_chart_accounts_block_delete ON public.chart_accounts;
--   DROP FUNCTION public.chart_accounts_block_delete_with_history();

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_payment_method;
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transactions_payment_method
  FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id) ON DELETE NO ACTION;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_cost_center;
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transactions_cost_center
  FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE NO ACTION;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_contact;
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transactions_contact
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE NO ACTION;

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS fk_transactions_category;
ALTER TABLE public.transactions
  ADD CONSTRAINT fk_transactions_category
  FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_categories_chart_account_id ON public.categories(chart_account_id);

-- Conta contábil não tem coluna direta em transactions: o vínculo é
-- transactions.category_id -> categories.chart_account_id, inclusive em contas
-- descendentes (cobre exclusão em lote da árvore). A FK de categories segue SET NULL.
CREATE OR REPLACE FUNCTION public.chart_accounts_block_delete_with_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
BEGIN
  SELECT c.name INTO v_categoria
  FROM public.categories c
  WHERE c.chart_account_id IN (
    WITH RECURSIVE arvore AS (
      SELECT OLD.id AS id
      UNION ALL
      SELECT ca.id FROM public.chart_accounts ca JOIN arvore a ON ca.parent_id = a.id
    )
    SELECT id FROM arvore
  )
    AND EXISTS (SELECT 1 FROM public.transactions t WHERE t.category_id = c.id)
  LIMIT 1;

  IF v_categoria IS NOT NULL THEN
    RAISE EXCEPTION 'CONTA_CONTABIL_COM_HISTORICO: existem lançamentos vinculados a esta conta contábil (categoria "%").', v_categoria
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_chart_accounts_block_delete ON public.chart_accounts;
CREATE TRIGGER trg_chart_accounts_block_delete
  BEFORE DELETE ON public.chart_accounts
  FOR EACH ROW EXECUTE FUNCTION public.chart_accounts_block_delete_with_history();
