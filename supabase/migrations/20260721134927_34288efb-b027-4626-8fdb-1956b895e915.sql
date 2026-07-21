
-- Phase 5: Retroactive batch categorization
CREATE OR REPLACE FUNCTION public.categorize_transactions_batch(
  p_limit integer DEFAULT 500,
  p_min_confidence numeric DEFAULT 0.7,
  p_context text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_only_uncategorized boolean DEFAULT true
)
RETURNS TABLE (
  scanned integer,
  updated integer,
  skipped_low_confidence integer,
  skipped_no_match integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_scanned int := 0;
  v_updated int := 0;
  v_low int := 0;
  v_none int := 0;
  r record;
  s record;
  v_type text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  FOR r IN
    SELECT id, description, transaction_type, context, company_id
      FROM public.transactions
     WHERE user_id = v_uid
       AND description IS NOT NULL
       AND length(trim(description)) > 0
       AND (NOT p_only_uncategorized OR category_id IS NULL)
       AND (p_context IS NULL OR context = p_context)
       AND (p_company_id IS NULL OR company_id = p_company_id)
     ORDER BY created_at DESC
     LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    v_scanned := v_scanned + 1;

    -- Map receita/despesa -> entrada/saida for rule matching
    v_type := CASE r.transaction_type
      WHEN 'receita' THEN 'entrada'
      WHEN 'despesa' THEN 'saida'
      ELSE r.transaction_type
    END;

    SELECT * INTO s FROM public.categorize_transaction(
      r.description, v_type, r.context, r.company_id, v_uid, 0.45
    ) LIMIT 1;

    IF s.category_id IS NULL THEN
      v_none := v_none + 1;
      CONTINUE;
    END IF;

    IF s.confidence < p_min_confidence THEN
      v_low := v_low + 1;
      CONTINUE;
    END IF;

    UPDATE public.transactions
       SET category_id = s.category_id,
           payment_method_id = COALESCE(payment_method_id, s.payment_method_id)
     WHERE id = r.id
       AND user_id = v_uid
       AND (NOT p_only_uncategorized OR category_id IS NULL);

    IF FOUND THEN
      v_updated := v_updated + 1;
      PERFORM public.increment_rule_hit(s.rule_id);
    END IF;
  END LOOP;

  scanned := v_scanned;
  updated := v_updated;
  skipped_low_confidence := v_low;
  skipped_no_match := v_none;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.categorize_transactions_batch(integer, numeric, text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorize_transactions_batch(integer, numeric, text, uuid, boolean) TO authenticated, service_role;
