CREATE OR REPLACE FUNCTION public.guard_transaction_category_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_active boolean;
  v_allow boolean;
  v_name text;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;

  SELECT c.is_active, c.allow_transactions, c.name
    INTO v_active, v_allow, v_name
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF v_active IS NOT NULL AND v_active = false THEN
    RAISE EXCEPTION 'A categoria "%" está bloqueada para lançamentos', COALESCE(v_name, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_allow IS NOT NULL AND v_allow = false THEN
    RAISE EXCEPTION 'A categoria "%" é agrupadora e não recebe lançamentos. Escolha uma categoria analítica.', COALESCE(v_name, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;