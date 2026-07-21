
-- Ensure pgmq queue exists
SELECT pgmq.create('ai_categorization') WHERE NOT EXISTS (
  SELECT 1 FROM pgmq.list_queues() WHERE queue_name = 'ai_categorization'
);

-- Enqueue helper: find uncategorized transactions of the caller and push to queue
CREATE OR REPLACE FUNCTION public.enqueue_uncategorized_for_ai(
  p_limit integer DEFAULT 200,
  p_context text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS TABLE(enqueued integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pgmq
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer := 0;
  r record;
  v_norm text;
  v_match jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR r IN
    SELECT t.id, t.description, t.transaction_type, t.context, t.company_id, t.amount
      FROM public.transactions t
     WHERE t.user_id = v_uid
       AND t.category_id IS NULL
       AND (p_context IS NULL OR t.context::text = p_context)
       AND (p_company_id IS NULL OR t.company_id = p_company_id)
       AND coalesce(t.description, '') <> ''
     ORDER BY t.created_at DESC
     LIMIT greatest(1, least(p_limit, 1000))
  LOOP
    -- Skip anything that the deterministic/similarity RPC can already solve
    v_match := public.categorize_transaction(
      p_description := r.description,
      p_transaction_type := r.transaction_type::text,
      p_context := r.context::text,
      p_company_id := r.company_id,
      p_min_similarity := 0.35
    );

    IF v_match IS NOT NULL AND (v_match->>'category_id') IS NOT NULL THEN
      CONTINUE;
    END IF;

    PERFORM pgmq.send(
      'ai_categorization',
      jsonb_build_object(
        'transaction_id', r.id,
        'user_id', v_uid,
        'description', r.description,
        'transaction_type', r.transaction_type,
        'context', r.context,
        'company_id', r.company_id,
        'amount', r.amount,
        'enqueued_at', now()
      )
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_uncategorized_for_ai(integer, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_uncategorized_for_ai(integer, text, uuid) TO authenticated;

-- Worker read (service_role only)
CREATE OR REPLACE FUNCTION public.read_ai_categorization_queue(
  p_batch integer DEFAULT 20,
  p_vt integer DEFAULT 60
)
RETURNS TABLE(msg_id bigint, message jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN QUERY
  SELECT m.msg_id, m.message
    FROM pgmq.read('ai_categorization', p_vt, p_batch) m;
END;
$$;

REVOKE ALL ON FUNCTION public.read_ai_categorization_queue(integer, integer) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.read_ai_categorization_queue(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_ai_categorization_message(p_msg_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
BEGIN
  RETURN pgmq.delete('ai_categorization', p_msg_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_ai_categorization_message(bigint) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.delete_ai_categorization_message(bigint) TO service_role;

-- Apply AI decision: update transaction + upsert a user-scoped learned rule
CREATE OR REPLACE FUNCTION public.apply_ai_categorization(
  p_transaction_id uuid,
  p_category_id uuid,
  p_confidence numeric DEFAULT 0.75,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_tx record;
  v_norm text;
  v_rule_id uuid;
BEGIN
  SELECT id, user_id, description, transaction_type, context, company_id, category_id
    INTO v_tx
    FROM public.transactions
   WHERE id = p_transaction_id;

  IF v_tx.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transaction_not_found');
  END IF;

  -- Only category owner (auth call) OR service_role should apply. Service role bypasses RLS.
  IF auth.uid() IS NOT NULL AND v_tx.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_tx.category_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_categorized');
  END IF;

  UPDATE public.transactions
     SET category_id = p_category_id
   WHERE id = p_transaction_id;

  v_norm := private.normalize_description(coalesce(v_tx.description, ''));

  IF v_norm IS NULL OR length(v_norm) < 3 THEN
    RETURN jsonb_build_object('ok', true, 'rule_created', false);
  END IF;

  -- Upsert user-scope learned rule (contains match on normalized description)
  INSERT INTO public.categorization_rules (
    scope, user_id, company_id, context, match_type, pattern,
    transaction_type, category_id, priority, confidence, source, is_active, notes
  ) VALUES (
    'user', v_tx.user_id, v_tx.company_id, v_tx.context::text,
    'contains', v_norm,
    v_tx.transaction_type::text, p_category_id,
    50, coalesce(p_confidence, 0.75), 'ai', true,
    coalesce(p_reason, 'Regra aprendida automaticamente pela IA')
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_rule_id;

  RETURN jsonb_build_object('ok', true, 'rule_created', v_rule_id IS NOT NULL, 'rule_id', v_rule_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_ai_categorization(uuid, uuid, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_ai_categorization(uuid, uuid, numeric, text) TO authenticated, service_role;
