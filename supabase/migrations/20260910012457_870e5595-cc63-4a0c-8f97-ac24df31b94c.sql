ALTER TABLE public.dp_apoio_unidades
  ADD COLUMN IF NOT EXISTS pro_labore numeric,
  ADD COLUMN IF NOT EXISTS horario jsonb,
  ADD COLUMN IF NOT EXISTS socio boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS dp_apoio_unidades_socio_idx
  ON public.dp_apoio_unidades (colaborador_id) WHERE socio;