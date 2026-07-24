-- Bloco 9: auto-categorização de lançamentos ingeridos via Open Finance
CREATE OR REPLACE FUNCTION public.auto_categorize_of_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pgmq
AS $$
DECLARE
  v_match jsonb;
  v_cat_id uuid;
BEGIN
  -- Só age em lançamentos vindos do Open Finance, sem categoria e com descrição.
  IF NEW.connection_account_id IS NULL
     OR NEW.category_id IS NOT NULL
     OR coalesce(NEW.description, '') = '' THEN
    RETURN NEW;
  END IF;

  -- 1) Tenta categorização determinística (regras + similaridade).
  BEGIN
    v_match := public.categorize_transaction(
      p_description := NEW.description,
      p_transaction_type := NEW.transaction_type::text,
      p_context := NEW.context::text,
      p_company_id := NEW.company_id,
      p_min_similarity := 0.35
    );
  EXCEPTION WHEN OTHERS THEN
    v_match := NULL;
  END;

  IF v_match IS NOT NULL AND (v_match->>'category_id') IS NOT NULL THEN
    v_cat_id := (v_match->>'category_id')::uuid;
    UPDATE public.transactions
       SET category_id = v_cat_id,
           categorization_source = COALESCE(v_match->>'source', 'auto_rule'),
           updated_at = now()
     WHERE id = NEW.id
       AND category_id IS NULL;
    RETURN NEW;
  END IF;

  -- 2) Enfileira para IA.
  BEGIN
    PERFORM pgmq.send(
      'ai_categorization',
      jsonb_build_object(
        'transaction_id', NEW.id,
        'user_id', NEW.user_id,
        'description', NEW.description,
        'transaction_type', NEW.transaction_type,
        'context', NEW.context,
        'company_id', NEW.company_id,
        'amount', NEW.amount,
        'source', 'open_finance',
        'enqueued_at', now()
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- Falha ao enfileirar não deve reverter a ingestão.
    NULL;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_categorize_of_transaction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auto_categorize_of ON public.transactions;
CREATE TRIGGER trg_auto_categorize_of
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.auto_categorize_of_transaction();