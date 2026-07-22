CREATE OR REPLACE FUNCTION public.learn_categorization_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_norm text;
  v_existing_id uuid;
  v_scope text;
  v_rule_user_id uuid;
BEGIN
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

  IF NEW.company_id IS NOT NULL THEN
    v_scope := 'company';
    v_rule_user_id := NULL;
  ELSE
    v_scope := 'user';
    v_rule_user_id := NEW.user_id;
  END IF;

  SELECT id INTO v_existing_id
    FROM public.categorization_rules
   WHERE scope = v_scope
     AND (user_id IS NOT DISTINCT FROM v_rule_user_id)
     AND (company_id IS NOT DISTINCT FROM NEW.company_id)
     AND match_type = 'contains'
     AND pattern = v_norm
     AND transaction_type = NEW.transaction_type::text
     AND (context IS NOT DISTINCT FROM NEW.context::text)
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.categorization_rules
       SET category_id = NEW.category_id,
           source = CASE WHEN source = 'ai_inferred' THEN 'user_confirmed' ELSE source END,
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
      v_scope, v_rule_user_id, NEW.company_id, NEW.context::text,
      'contains', v_norm,
      NEW.transaction_type::text, NEW.category_id,
      40, 0.9, 'user_manual', true,
      'Regra aprendida a partir de categorização manual'
    );
  END IF;

  RETURN NEW;
END;
$function$;