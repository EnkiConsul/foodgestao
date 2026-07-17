CREATE OR REPLACE FUNCTION public.enforce_monthly_due_date_alignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  series_type text;
  base_day int;
  due_day int;
  due_last int;
  target_day int;
  candidate_a date;
  candidate_b date;
BEGIN
  IF NEW.due_date IS NULL OR NEW.transaction_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_recurring IS TRUE AND NEW.recurrence_type IS NOT NULL THEN
    series_type := NEW.recurrence_type::text;
  ELSIF NEW.parent_transaction_id IS NOT NULL THEN
    SELECT recurrence_type::text INTO series_type
    FROM public.transactions
    WHERE id = NEW.parent_transaction_id;
  ELSE
    series_type := NULL;
  END IF;

  -- Guarda NULL-safe: sem série ⇒ não alinha (corrige bug de NULL NOT IN)
  IF series_type IS NULL OR series_type NOT IN ('mensal', 'quinzenal') THEN
    RETURN NEW;
  END IF;

  base_day := EXTRACT(DAY FROM NEW.transaction_date)::int;
  due_day  := EXTRACT(DAY FROM NEW.due_date)::int;
  due_last := EXTRACT(DAY FROM (date_trunc('month', NEW.due_date) + interval '1 month - 1 day'))::int;

  IF series_type = 'mensal' THEN
    target_day := LEAST(base_day, due_last);
    IF due_day <> target_day THEN
      NEW.due_date := (date_trunc('month', NEW.due_date) + make_interval(days => target_day - 1))::date;
    END IF;
  ELSE
    candidate_a := (date_trunc('month', NEW.due_date) + make_interval(days => LEAST(base_day, due_last) - 1))::date;
    candidate_b := (candidate_a + interval '15 days')::date;

    IF NEW.due_date <> candidate_a AND NEW.due_date <> candidate_b THEN
      IF ABS(NEW.due_date - candidate_a) <= ABS(NEW.due_date - candidate_b) THEN
        NEW.due_date := candidate_a;
      ELSE
        NEW.due_date := candidate_b;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_weekly_due_date_alignment()
RETURNS trigger
LANGUAGE plpgsql
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

  target_dow  := EXTRACT(DOW FROM NEW.transaction_date)::int;
  current_dow := EXTRACT(DOW FROM NEW.due_date)::int;
  IF current_dow <> target_dow THEN
    diff := target_dow - current_dow;
    NEW.due_date := (NEW.due_date + make_interval(days => diff))::date;
  END IF;

  RETURN NEW;
END;
$$;