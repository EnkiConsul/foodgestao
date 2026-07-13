
CREATE OR REPLACE FUNCTION public.enforce_weekly_due_date_alignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  is_weekly boolean := false;
  parent_rec_type text;
  target_dow int;
  current_dow int;
  diff int;
BEGIN
  IF NEW.due_date IS NULL OR NEW.transaction_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_recurring, false) = true
     AND NEW.recurrence_type::text = 'semanal' THEN
    is_weekly := true;
  END IF;

  IF NOT is_weekly AND NEW.parent_transaction_id IS NOT NULL THEN
    SELECT recurrence_type::text INTO parent_rec_type
    FROM public.transactions
    WHERE id = NEW.parent_transaction_id;
    IF parent_rec_type = 'semanal' THEN
      is_weekly := true;
    END IF;
  END IF;

  IF NOT is_weekly THEN
    RETURN NEW;
  END IF;

  target_dow := EXTRACT(DOW FROM NEW.transaction_date)::int;
  current_dow := EXTRACT(DOW FROM NEW.due_date)::int;

  IF target_dow <> current_dow THEN
    diff := ((target_dow - current_dow) + 7) % 7;
    NEW.due_date := NEW.due_date + diff;
  END IF;

  RETURN NEW;
END;
$$;
