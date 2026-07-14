-- Function: alinha due_date ao dia do mês da transaction_date para séries mensal/quinzenal
CREATE OR REPLACE FUNCTION public.enforce_monthly_due_date_alignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
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

  -- Descobre o tipo de série: da própria transação (recorrente) ou do parent (parcela filha)
  IF NEW.is_recurring IS TRUE AND NEW.recurrence_type IS NOT NULL THEN
    series_type := NEW.recurrence_type;
  ELSIF NEW.parent_transaction_id IS NOT NULL THEN
    SELECT recurrence_type INTO series_type
    FROM public.transactions
    WHERE id = NEW.parent_transaction_id;
  ELSE
    series_type := NULL;
  END IF;

  IF series_type NOT IN ('mensal', 'quinzenal') THEN
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
    -- quinzenal: aceita dia da base OU base + 15 (clampados ao último dia do mês do due_date)
    candidate_a := (date_trunc('month', NEW.due_date) + make_interval(days => LEAST(base_day, due_last) - 1))::date;
    candidate_b := (NEW.due_date::date - (due_day - 1) + LEAST(base_day + 15 - 1, due_last + 15) )::date;
    -- Recalcula candidate_b corretamente: adiciona 15 dias ao candidate_a base do mês
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

DROP TRIGGER IF EXISTS enforce_monthly_due_date_alignment_trg ON public.transactions;
CREATE TRIGGER enforce_monthly_due_date_alignment_trg
BEFORE INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_monthly_due_date_alignment();