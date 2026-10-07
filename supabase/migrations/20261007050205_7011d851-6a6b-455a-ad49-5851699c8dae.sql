ALTER TABLE public.dp_unidades
  ADD COLUMN IF NOT EXISTS banco_horas boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compensa_feriados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS compensacao_feriado_antecedencia_dias integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS compensacao_sindical_ciencia_em timestamptz,
  ADD COLUMN IF NOT EXISTS compensacao_sindical_ciencia_por uuid;

ALTER TABLE public.dp_unidades
  ADD CONSTRAINT dp_unidades_comp_antecedencia_chk
  CHECK (compensacao_feriado_antecedencia_dias BETWEEN 0 AND 60);