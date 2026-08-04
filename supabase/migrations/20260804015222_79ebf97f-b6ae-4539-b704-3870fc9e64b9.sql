CREATE TABLE IF NOT EXISTS public.category_template_chart_links_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  category_code text NOT NULL,
  category_name text,
  previous_chart_account_code text,
  new_chart_account_code text,
  chart_account_name text,
  confidence numeric,
  rationale text,
  requires_review boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'ai_suggestion',
  applied_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid
);

CREATE INDEX IF NOT EXISTS idx_cat_tpl_chart_log_batch ON public.category_template_chart_links_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_cat_tpl_chart_log_applied_at ON public.category_template_chart_links_log (applied_at DESC);

GRANT SELECT ON public.category_template_chart_links_log TO authenticated;
GRANT ALL ON public.category_template_chart_links_log TO service_role;

ALTER TABLE public.category_template_chart_links_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_chart_links_log" ON public.category_template_chart_links_log;
CREATE POLICY "super_admin_read_chart_links_log"
ON public.category_template_chart_links_log
FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_chart_account_suggestions(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_prev text;
  v_name text;
  v_chart_name text;
  v_applied int := 0;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb))
  LOOP
    BEGIN
      v_prev := NULL; v_name := NULL; v_chart_name := NULL;

      SELECT chart_account_code, name INTO v_prev, v_name
      FROM public.category_templates
      WHERE code = (v_item->>'category_code');

      IF v_name IS NULL THEN
        RAISE EXCEPTION 'categoria % nao encontrada', (v_item->>'category_code');
      END IF;

      UPDATE public.category_templates
      SET chart_account_code = (v_item->>'chart_account_code')
      WHERE code = (v_item->>'category_code');

      SELECT name INTO v_chart_name
      FROM public.chart_account_templates
      WHERE code = (v_item->>'chart_account_code');

      INSERT INTO public.category_template_chart_links_log (
        batch_id, category_code, category_name, previous_chart_account_code,
        new_chart_account_code, chart_account_name, confidence, rationale,
        requires_review, applied_by
      ) VALUES (
        v_batch, v_item->>'category_code', v_name, v_prev,
        v_item->>'chart_account_code', v_chart_name,
        nullif(v_item->>'confidence','')::numeric, v_item->>'rationale',
        coalesce((v_item->>'requires_review')::boolean, false), auth.uid()
      );

      v_applied := v_applied + 1;
    EXCEPTION WHEN others THEN
      v_failures := v_failures || jsonb_build_object(
        'category_code', v_item->>'category_code',
        'message', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object('batch_id', v_batch, 'applied', v_applied, 'failures', v_failures);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_chart_account_suggestions(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_chart_account_suggestions(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.revert_chart_account_suggestion_batch(_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_reverted int := 0;
  v_failures jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  FOR v_row IN
    SELECT * FROM public.category_template_chart_links_log
    WHERE batch_id = _batch_id AND reverted_at IS NULL
  LOOP
    BEGIN
      UPDATE public.category_templates
      SET chart_account_code = v_row.previous_chart_account_code
      WHERE code = v_row.category_code;

      UPDATE public.category_template_chart_links_log
      SET reverted_at = now(), reverted_by = auth.uid()
      WHERE id = v_row.id;

      v_reverted := v_reverted + 1;
    EXCEPTION WHEN others THEN
      v_failures := v_failures || jsonb_build_object(
        'category_code', v_row.category_code,
        'message', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object('reverted', v_reverted, 'failures', v_failures);
END;
$$;

REVOKE ALL ON FUNCTION public.revert_chart_account_suggestion_batch(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revert_chart_account_suggestion_batch(uuid) TO authenticated;