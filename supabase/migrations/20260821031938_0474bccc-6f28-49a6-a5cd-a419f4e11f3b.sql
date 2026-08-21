ALTER TABLE public.dp_unidade_horarios_funcionamento
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nome text;

DO $$
DECLARE cname text;
BEGIN
  FOR cname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.dp_unidade_horarios_funcionamento'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.dp_unidade_horarios_funcionamento DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.dp_unidade_horarios_funcionamento_unidade_dia_idx;

ALTER TABLE public.dp_unidade_horarios_funcionamento
  ADD CONSTRAINT dp_unidade_horarios_func_unidade_dia_ordem_key
  UNIQUE (unidade_id, dia_semana, ordem);