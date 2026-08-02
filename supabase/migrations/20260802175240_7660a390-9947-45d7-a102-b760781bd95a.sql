CREATE OR REPLACE FUNCTION public.guard_transaction_category_active()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active boolean;
  v_name text;
BEGIN
  IF NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.category_id IS NOT DISTINCT FROM NEW.category_id THEN
    RETURN NEW;
  END IF;

  SELECT c.is_active, c.name INTO v_active, v_name
  FROM public.categories c
  WHERE c.id = NEW.category_id;

  IF v_active IS NOT NULL AND v_active = false THEN
    RAISE EXCEPTION 'A categoria "%" está bloqueada para lançamentos', COALESCE(v_name, '—')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_transaction_category_active ON public.transactions;
CREATE TRIGGER guard_transaction_category_active
BEFORE INSERT OR UPDATE OF category_id ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.guard_transaction_category_active();