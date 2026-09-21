-- ============================================================================
-- Correção PREPARADA do achado A7 — NÃO APLICADA.
-- Exige que a conta (account_id) e o cartão (credit_card_id) do lançamento
-- pertençam à mesma empresa do lançamento. Mesmo padrão e mesmo código de erro
-- do guard já existente para a conta de destino (42501).
--
-- Não altera policies, grants, funções de saldo nem dados históricos.
--
-- PASSO 0 — JÁ MEDIDO em produção em 21/09/2026 (docs/security/d1/d1-a7-contagens.sql):
--   contas divergentes = 0, cartões divergentes = 0, conta de destino = 0.
--   Não há linha legada inconsistente, portanto a validação pode cobrir INSERT e UPDATE
--   sem travar edição de histórico. Reexecutar a medição se a aplicação demorar:
--   SELECT count(*) AS contas_divergentes
--     FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
--    WHERE t.company_id IS DISTINCT FROM a.company_id;
--   SELECT count(*) AS cartoes_divergentes
--     FROM public.transactions t JOIN public.credit_cards cc ON cc.id = t.credit_card_id
--    WHERE t.company_id IS DISTINCT FROM cc.company_id;
-- Se uma medição futura apontar linhas divergentes, restringir o gatilho de UPDATE às colunas
-- account_id/credit_card_id/company_id para não travar a edição de linhas legadas.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_transaction_source_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _src RECORD;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    SELECT user_id, company_id, context
      INTO _src
      FROM public.accounts
     WHERE id = NEW.account_id;

    IF _src IS NULL THEN
      RAISE EXCEPTION 'Conta do lançamento não encontrada' USING ERRCODE = '23514';
    END IF;

    IF NEW.context = 'pj' THEN
      IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'Lançamento empresarial requer empresa' USING ERRCODE = '23514';
      END IF;
      IF _src.company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'Conta do lançamento não pertence à mesma empresa do lançamento'
          USING ERRCODE = '42501';
      END IF;
    ELSE
      IF _src.user_id <> NEW.user_id THEN
        RAISE EXCEPTION 'Conta do lançamento não pertence ao usuário' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF NEW.credit_card_id IS NOT NULL THEN
    SELECT user_id, company_id
      INTO _src
      FROM public.credit_cards
     WHERE id = NEW.credit_card_id;

    IF _src IS NULL THEN
      RAISE EXCEPTION 'Cartão do lançamento não encontrado' USING ERRCODE = '23514';
    END IF;

    IF NEW.context = 'pj' THEN
      IF NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'Lançamento empresarial requer empresa' USING ERRCODE = '23514';
      END IF;
      IF _src.company_id IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION 'Cartão do lançamento não pertence à mesma empresa do lançamento'
          USING ERRCODE = '42501';
      END IF;
    ELSIF _src.user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Cartão do lançamento não pertence ao usuário' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_transaction_source_tenant ON public.transactions;

CREATE TRIGGER trg_validate_transaction_source_tenant
BEFORE INSERT OR UPDATE OF account_id, credit_card_id, company_id, user_id, context
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.validate_transaction_source_tenant();

-- Rollback:
--   DROP TRIGGER IF EXISTS trg_validate_transaction_source_tenant ON public.transactions;
--   DROP FUNCTION IF EXISTS public.validate_transaction_source_tenant();
