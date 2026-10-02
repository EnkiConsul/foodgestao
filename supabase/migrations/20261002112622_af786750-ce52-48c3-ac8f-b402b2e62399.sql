ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS feriados_locais_ciente_em timestamptz,
  ADD COLUMN IF NOT EXISTS feriados_locais_ciente_por uuid;