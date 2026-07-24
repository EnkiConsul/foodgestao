
-- 1) Substitui trigger para consumir corretamente o retorno TABLE de categorize_transaction
--    e adiciona vinculação automática de contato por CNPJ/nome de contraparte.
CREATE OR REPLACE FUNCTION public.auto_categorize_of_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pgmq
AS $$
DECLARE
  v_cat_id uuid;
  v_pm_id uuid;
  v_rule_id uuid;
  v_layer text;
  v_contact_id uuid;
  v_doc_norm text;
BEGIN
  -- Só age em lançamentos Open Finance (connection_account_id não nulo)
  IF NEW.connection_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1) Auto-linking de contato por CNPJ (prioritário) ou nome
  IF NEW.contact_id IS NULL AND NEW.company_id IS NOT NULL
     AND (coalesce(NEW.counterparty_cnpj, '') <> '' OR coalesce(NEW.counterparty_name, '') <> '') THEN
    v_doc_norm := regexp_replace(coalesce(NEW.counterparty_cnpj, ''), '\D', '', 'g');

    IF length(v_doc_norm) > 0 THEN
      SELECT c.id INTO v_contact_id
        FROM public.contacts c
        JOIN public.contact_companies cc ON cc.contact_id = c.id
       WHERE cc.company_id = NEW.company_id
         AND regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_doc_norm
         AND c.is_active = true
       LIMIT 1;
    END IF;

    IF v_contact_id IS NULL AND coalesce(NEW.counterparty_name, '') <> '' THEN
      SELECT c.id INTO v_contact_id
        FROM public.contacts c
        JOIN public.contact_companies cc ON cc.contact_id = c.id
       WHERE cc.company_id = NEW.company_id
         AND c.is_active = true
         AND lower(c.name) = lower(NEW.counterparty_name)
       LIMIT 1;
    END IF;

    IF v_contact_id IS NOT NULL THEN
      UPDATE public.transactions
         SET contact_id = v_contact_id, updated_at = now()
       WHERE id = NEW.id AND contact_id IS NULL;
    END IF;
  END IF;

  -- 2) Categorização determinística/similaridade
  IF NEW.category_id IS NULL AND coalesce(NEW.description, '') <> '' THEN
    BEGIN
      SELECT r.category_id, r.payment_method_id, r.rule_id, r.layer
        INTO v_cat_id, v_pm_id, v_rule_id, v_layer
        FROM public.categorize_transaction(
          p_description := NEW.description,
          p_transaction_type := NEW.transaction_type::text,
          p_context := NEW.context::text,
          p_company_id := NEW.company_id,
          p_user_id := NEW.user_id,
          p_min_similarity := 0.45
        ) r
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_cat_id := NULL;
    END;

    IF v_cat_id IS NOT NULL THEN
      UPDATE public.transactions
         SET category_id = v_cat_id,
             payment_method_id = COALESCE(payment_method_id, v_pm_id),
             categorization_source = CASE WHEN v_layer = 'similarity' THEN 'auto_similarity' ELSE 'auto_rule' END,
             updated_at = now()
       WHERE id = NEW.id
         AND category_id IS NULL;

      IF v_rule_id IS NOT NULL THEN
        PERFORM public.increment_rule_hit(v_rule_id);
      END IF;

      RETURN NEW;
    END IF;

    -- 3) Sem match determinístico: enfileira para IA (best-effort)
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
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_categorize_of_transaction() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_auto_categorize_of ON public.transactions;
CREATE TRIGGER trg_auto_categorize_of
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.auto_categorize_of_transaction();

-- 2) RPC para reprocessamento em lote (backfill de lançamentos históricos)
CREATE OR REPLACE FUNCTION public.reconcile_of_transactions(
  p_company_id uuid,
  p_limit integer DEFAULT 500
)
RETURNS TABLE (
  scanned integer,
  categorized integer,
  linked_contact integer,
  enqueued_ai integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pgmq
AS $$
DECLARE
  v_scanned int := 0;
  v_categorized int := 0;
  v_linked int := 0;
  v_enqueued int := 0;
  r record;
  v_cat_id uuid;
  v_pm_id uuid;
  v_rule_id uuid;
  v_layer text;
  v_contact_id uuid;
  v_doc_norm text;
BEGIN
  -- Autorização: precisa ser membro/dono da empresa
  IF NOT EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id = p_company_id
       AND (c.owner_id = auth.uid()
            OR EXISTS (SELECT 1 FROM public.company_members m
                        WHERE m.company_id = c.id AND m.user_id = auth.uid()))
  ) AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not_authorized_for_company';
  END IF;

  FOR r IN
    SELECT t.id, t.description, t.transaction_type, t.context, t.company_id,
           t.user_id, t.category_id, t.contact_id,
           t.counterparty_cnpj, t.counterparty_name
      FROM public.transactions t
     WHERE t.company_id = p_company_id
       AND t.connection_account_id IS NOT NULL
       AND (t.category_id IS NULL OR t.contact_id IS NULL)
     ORDER BY t.created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    v_scanned := v_scanned + 1;

    -- contato
    IF r.contact_id IS NULL
       AND (coalesce(r.counterparty_cnpj, '') <> '' OR coalesce(r.counterparty_name, '') <> '') THEN
      v_contact_id := NULL;
      v_doc_norm := regexp_replace(coalesce(r.counterparty_cnpj, ''), '\D', '', 'g');
      IF length(v_doc_norm) > 0 THEN
        SELECT c.id INTO v_contact_id
          FROM public.contacts c
          JOIN public.contact_companies cc ON cc.contact_id = c.id
         WHERE cc.company_id = r.company_id
           AND regexp_replace(coalesce(c.document, ''), '\D', '', 'g') = v_doc_norm
           AND c.is_active = true
         LIMIT 1;
      END IF;
      IF v_contact_id IS NULL AND coalesce(r.counterparty_name, '') <> '' THEN
        SELECT c.id INTO v_contact_id
          FROM public.contacts c
          JOIN public.contact_companies cc ON cc.contact_id = c.id
         WHERE cc.company_id = r.company_id
           AND c.is_active = true
           AND lower(c.name) = lower(r.counterparty_name)
         LIMIT 1;
      END IF;
      IF v_contact_id IS NOT NULL THEN
        UPDATE public.transactions
           SET contact_id = v_contact_id, updated_at = now()
         WHERE id = r.id AND contact_id IS NULL;
        v_linked := v_linked + 1;
      END IF;
    END IF;

    -- categoria
    IF r.category_id IS NULL AND coalesce(r.description, '') <> '' THEN
      v_cat_id := NULL; v_pm_id := NULL; v_rule_id := NULL; v_layer := NULL;
      BEGIN
        SELECT ct.category_id, ct.payment_method_id, ct.rule_id, ct.layer
          INTO v_cat_id, v_pm_id, v_rule_id, v_layer
          FROM public.categorize_transaction(
            p_description := r.description,
            p_transaction_type := r.transaction_type::text,
            p_context := r.context::text,
            p_company_id := r.company_id,
            p_user_id := r.user_id,
            p_min_similarity := 0.45
          ) ct
          LIMIT 1;
      EXCEPTION WHEN OTHERS THEN
        v_cat_id := NULL;
      END;

      IF v_cat_id IS NOT NULL THEN
        UPDATE public.transactions
           SET category_id = v_cat_id,
               payment_method_id = COALESCE(payment_method_id, v_pm_id),
               categorization_source = CASE WHEN v_layer = 'similarity' THEN 'auto_similarity' ELSE 'auto_rule' END,
               updated_at = now()
         WHERE id = r.id AND category_id IS NULL;
        IF v_rule_id IS NOT NULL THEN
          PERFORM public.increment_rule_hit(v_rule_id);
        END IF;
        v_categorized := v_categorized + 1;
      ELSE
        BEGIN
          PERFORM pgmq.send(
            'ai_categorization',
            jsonb_build_object(
              'transaction_id', r.id,
              'user_id', r.user_id,
              'description', r.description,
              'transaction_type', r.transaction_type,
              'context', r.context,
              'company_id', r.company_id,
              'source', 'open_finance_reconcile',
              'enqueued_at', now()
            )
          );
          v_enqueued := v_enqueued + 1;
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_scanned, v_categorized, v_linked, v_enqueued;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_of_transactions(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_of_transactions(uuid, integer) TO authenticated, service_role;
