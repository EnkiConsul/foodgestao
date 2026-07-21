
-- Phase 3: RPC categorize_transaction (Layer 1: deterministic + Layer 2: similarity)
CREATE OR REPLACE FUNCTION public.categorize_transaction(
  p_description text,
  p_transaction_type text DEFAULT NULL,
  p_context text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_min_similarity numeric DEFAULT 0.45
)
RETURNS TABLE (
  category_id uuid,
  payment_method_id uuid,
  confidence numeric,
  layer text,
  rule_id uuid,
  match_type text,
  pattern text,
  similarity numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  IF p_description IS NULL OR length(trim(p_description)) = 0 THEN
    RETURN;
  END IF;

  v_norm := private.normalize_description(p_description);
  IF v_norm IS NULL OR length(v_norm) = 0 THEN
    RETURN;
  END IF;

  -- Layer 1: deterministic (exact / contains / regex), scope priority: user > company > system
  RETURN QUERY
  WITH candidates AS (
    SELECT r.*,
      CASE r.scope WHEN 'user' THEN 3 WHEN 'company' THEN 2 ELSE 1 END AS scope_rank
    FROM public.categorization_rules r
    WHERE r.is_active = true
      AND (r.transaction_type IS NULL OR p_transaction_type IS NULL OR r.transaction_type = p_transaction_type)
      AND (r.context IS NULL OR p_context IS NULL OR r.context = p_context)
      AND (
        r.scope = 'system'
        OR (r.scope = 'company' AND p_company_id IS NOT NULL AND r.company_id = p_company_id)
        OR (r.scope = 'user' AND v_uid IS NOT NULL AND r.user_id = v_uid)
      )
      AND (
        (r.match_type = 'exact' AND v_norm = private.normalize_description(r.pattern))
        OR (r.match_type = 'contains' AND v_norm LIKE '%' || private.normalize_description(r.pattern) || '%')
        OR (r.match_type = 'regex' AND v_norm ~* r.pattern)
      )
  )
  SELECT c.category_id, c.payment_method_id, c.confidence,
         'deterministic'::text AS layer, c.id AS rule_id, c.match_type, c.pattern,
         NULL::numeric AS similarity
  FROM candidates c
  ORDER BY c.scope_rank DESC, c.priority DESC, c.confidence DESC, c.hit_count DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Layer 2: similarity via pg_trgm on normalized pattern
  RETURN QUERY
  WITH sim AS (
    SELECT r.*,
      similarity(v_norm, private.normalize_description(r.pattern)) AS sim_score,
      CASE r.scope WHEN 'user' THEN 3 WHEN 'company' THEN 2 ELSE 1 END AS scope_rank
    FROM public.categorization_rules r
    WHERE r.is_active = true
      AND r.match_type IN ('exact','contains')
      AND (r.transaction_type IS NULL OR p_transaction_type IS NULL OR r.transaction_type = p_transaction_type)
      AND (r.context IS NULL OR p_context IS NULL OR r.context = p_context)
      AND (
        r.scope = 'system'
        OR (r.scope = 'company' AND p_company_id IS NOT NULL AND r.company_id = p_company_id)
        OR (r.scope = 'user' AND v_uid IS NOT NULL AND r.user_id = v_uid)
      )
  )
  SELECT s.category_id, s.payment_method_id,
         LEAST(0.99, s.confidence * s.sim_score)::numeric AS confidence,
         'similarity'::text AS layer, s.id AS rule_id, s.match_type, s.pattern,
         s.sim_score AS similarity
  FROM sim s
  WHERE s.sim_score >= p_min_similarity
  ORDER BY s.sim_score DESC, s.scope_rank DESC, s.priority DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.categorize_transaction(text, text, text, uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorize_transaction(text, text, text, uuid, uuid, numeric) TO authenticated, service_role;

-- Helper to increment hit_count after a rule is applied (audit/learning)
CREATE OR REPLACE FUNCTION public.increment_rule_hit(p_rule_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.categorization_rules
     SET hit_count = hit_count + 1, last_hit_at = now()
   WHERE id = p_rule_id;
$$;

REVOKE ALL ON FUNCTION public.increment_rule_hit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_rule_hit(uuid) TO authenticated, service_role;
