
-- Trigger function: learn from manual categorization / correction
CREATE OR REPLACE FUNCTION public.learn_categorization_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_norm text;
  v_existing_id uuid;
BEGIN
  -- Only react to real category changes (INSERT with category or UPDATE that changes it)
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL OR coalesce(NEW.description, '') = '' THEN
    RETURN NEW;
  END IF;

  v_norm := private.normalize_description(NEW.description);
  IF v_norm IS NULL OR length(v_norm) < 3 THEN
    RETURN NEW;
  END IF;

  -- Look for an existing user rule with the same pattern/type/context
  SELECT id INTO v_existing_id
    FROM public.categorization_rules
   WHERE scope = 'user'
     AND user_id = NEW.user_id
     AND match_type = 'contains'
     AND pattern = v_norm
     AND transaction_type = NEW.transaction_type::text
     AND (context IS NOT DISTINCT FROM NEW.context::text)
     AND (company_id IS NOT DISTINCT FROM NEW.company_id)
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Correction path: update rule to new category if different
    UPDATE public.categorization_rules
       SET category_id = NEW.category_id,
           source = CASE WHEN source = 'ai' THEN 'user_correction' ELSE source END,
           confidence = greatest(confidence, 0.9),
           is_active = true,
           updated_at = now(),
           notes = 'Regra atualizada por correção manual do usuário'
     WHERE id = v_existing_id
       AND category_id IS DISTINCT FROM NEW.category_id;
  ELSE
    INSERT INTO public.categorization_rules (
      scope, user_id, company_id, context, match_type, pattern,
      transaction_type, category_id, priority, confidence, source, is_active, notes
    ) VALUES (
      'user', NEW.user_id, NEW.company_id, NEW.context::text,
      'contains', v_norm,
      NEW.transaction_type::text, NEW.category_id,
      40, 0.9, 'user_manual', true,
      'Regra aprendida a partir de categorização manual'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_learn_categorization_rule ON public.transactions;
CREATE TRIGGER trg_learn_categorization_rule
AFTER INSERT OR UPDATE OF category_id ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.learn_categorization_rule();
