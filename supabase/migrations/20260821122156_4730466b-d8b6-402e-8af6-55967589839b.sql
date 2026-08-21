CREATE OR REPLACE FUNCTION public.chart_accounts_resequence(_context public.context_type)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _changed int := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  CREATE TEMP TABLE _rs_codes (id uuid PRIMARY KEY, new_code text NOT NULL) ON COMMIT DROP;

  INSERT INTO _rs_codes (id, new_code)
  WITH RECURSIVE ranked AS (
    SELECT a.id, a.parent_id,
           row_number() OVER (
             PARTITION BY a.parent_id
             ORDER BY COALESCE(NULLIF(regexp_replace(split_part(a.code, '.', GREATEST(array_length(string_to_array(a.code, '.'), 1), 1)), '\D', '', 'g'), '')::int, 999999),
                      a.name
           ) AS rn
      FROM public.chart_accounts a
     WHERE a.user_id = _uid AND a.context = _context
  ), rec AS (
    SELECT r.id, r.rn::text AS new_code FROM ranked r WHERE r.parent_id IS NULL
    UNION ALL
    SELECT r.id, rec.new_code || '.' || r.rn::text
      FROM ranked r JOIN rec ON r.parent_id = rec.id
  )
  SELECT id, new_code FROM rec;

  -- Two-phase update to avoid unique index clashes
  UPDATE public.chart_accounts a
     SET code = '__rs__' || a.id::text
    FROM _rs_codes n
   WHERE a.id = n.id AND a.code IS DISTINCT FROM n.new_code;

  UPDATE public.chart_accounts a
     SET code = n.new_code
    FROM _rs_codes n
   WHERE a.id = n.id AND a.code LIKE '__rs__%';

  SELECT count(*)::int INTO _changed FROM _rs_codes n JOIN public.chart_accounts a ON a.id = n.id;
  DROP TABLE _rs_codes;
  RETURN _changed;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_resequence(public.context_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chart_accounts_resequence(public.context_type) TO authenticated, service_role;