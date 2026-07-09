
-- Allow code to be filled by trigger
ALTER TABLE public.chart_accounts ALTER COLUMN code DROP NOT NULL;

-- Next-code helper
CREATE OR REPLACE FUNCTION public.chart_account_next_code(_parent_id uuid, _user_id uuid, _context public.context_type)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _parent_code text;
  _max int := 0;
  _rec record;
  _n int;
BEGIN
  IF _parent_id IS NULL THEN
    FOR _rec IN
      SELECT code FROM public.chart_accounts
      WHERE user_id = _user_id AND context = _context AND parent_id IS NULL AND code IS NOT NULL
    LOOP
      _n := NULLIF(split_part(_rec.code, '.', 1), '')::int;
      IF _n IS NOT NULL AND _n > _max THEN _max := _n; END IF;
    END LOOP;
    RETURN (_max + 1)::text;
  ELSE
    SELECT code INTO _parent_code FROM public.chart_accounts WHERE id = _parent_id;
    IF _parent_code IS NULL THEN RAISE EXCEPTION 'Conta pai sem código'; END IF;
    FOR _rec IN
      SELECT code FROM public.chart_accounts
      WHERE parent_id = _parent_id AND code IS NOT NULL
    LOOP
      -- suffix = last segment
      _n := NULLIF(split_part(_rec.code, '.', array_length(string_to_array(_rec.code, '.'), 1)), '')::int;
      IF _n IS NOT NULL AND _n > _max THEN _max := _n; END IF;
    END LOOP;
    RETURN _parent_code || '.' || (_max + 1)::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_account_next_code(uuid, uuid, public.context_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chart_account_next_code(uuid, uuid, public.context_type) TO authenticated, service_role;

-- BEFORE INSERT trigger to autofill code
CREATE OR REPLACE FUNCTION public.chart_account_autofill_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    NEW.code := public.chart_account_next_code(NEW.parent_id, NEW.user_id, NEW.context);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chart_account_autofill_code ON public.chart_accounts;
CREATE TRIGGER trg_chart_account_autofill_code
  BEFORE INSERT ON public.chart_accounts
  FOR EACH ROW EXECUTE FUNCTION public.chart_account_autofill_code();

-- Move a subtree to a new parent, recomputing codes in cascade
CREATE OR REPLACE FUNCTION public.chart_account_move(_id uuid, _new_parent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _acc public.chart_accounts;
  _new_parent public.chart_accounts;
  _new_code text;
  _old_code text;
  _rec record;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _acc FROM public.chart_accounts WHERE id = _id;
  IF _acc.user_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;

  IF _new_parent_id IS NOT NULL THEN
    SELECT * INTO _new_parent FROM public.chart_accounts WHERE id = _new_parent_id;
    IF _new_parent.user_id IS DISTINCT FROM _uid THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    IF _new_parent.context <> _acc.context THEN RAISE EXCEPTION 'Contexto incompatível' USING ERRCODE = '22023'; END IF;
    -- Prevent moving under a descendant of itself
    IF EXISTS (
      WITH RECURSIVE d AS (
        SELECT id FROM public.chart_accounts WHERE id = _id
        UNION ALL
        SELECT c.id FROM public.chart_accounts c JOIN d ON c.parent_id = d.id
      ) SELECT 1 FROM d WHERE id = _new_parent_id
    ) THEN
      RAISE EXCEPTION 'Não é possível mover para um descendente' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF _acc.parent_id IS NOT DISTINCT FROM _new_parent_id THEN RETURN; END IF;

  _old_code := _acc.code;
  _new_code := public.chart_account_next_code(_new_parent_id, _uid, _acc.context);

  -- Two-phase to avoid unique clashes: park to temporary sentinel prefix first
  UPDATE public.chart_accounts
     SET code = '__mv__' || id::text || '__' || code
   WHERE user_id = _uid AND context = _acc.context
     AND (id = _id OR code LIKE _old_code || '.%');

  -- Update root account
  UPDATE public.chart_accounts SET parent_id = _new_parent_id, code = _new_code WHERE id = _id;

  -- Update descendants: rewrite prefix from _old_code to _new_code
  FOR _rec IN
    SELECT id, replace(regexp_replace(code, '^__mv__[^_]+__', ''), '', '') AS orig_code
    FROM public.chart_accounts
    WHERE user_id = _uid AND context = _acc.context
      AND code LIKE '__mv__%'
      AND id <> _id
  LOOP
    -- extract original code back
    UPDATE public.chart_accounts
       SET code = _new_code || substr(
             regexp_replace(code, '^__mv__[^_]+__', ''),
             length(_old_code) + 1
           )
     WHERE id = _rec.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_account_move(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chart_account_move(uuid, uuid) TO authenticated, service_role;
