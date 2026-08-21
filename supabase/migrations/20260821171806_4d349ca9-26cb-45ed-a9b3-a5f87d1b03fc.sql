ALTER TABLE public.dp_va_apuracoes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'va',
  ADD COLUMN IF NOT EXISTS dias_pagos_anterior integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_trabalhados_anterior integer,
  ADD COLUMN IF NOT EXISTS total_dias integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fechado_em timestamptz,
  ADD COLUMN IF NOT EXISTS fechado_por uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dp_va_apuracoes_tipo_check'
  ) THEN
    ALTER TABLE public.dp_va_apuracoes
      ADD CONSTRAINT dp_va_apuracoes_tipo_check CHECK (tipo IN ('va', 'vt'));
  END IF;
END $$;

ALTER TABLE public.dp_va_apuracoes
  DROP CONSTRAINT IF EXISTS dp_va_apuracoes_colaborador_id_competencia_key;

CREATE UNIQUE INDEX IF NOT EXISTS dp_va_apuracoes_colab_comp_tipo_key
  ON public.dp_va_apuracoes (colaborador_id, competencia, tipo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dp_va_apuracoes TO authenticated;
GRANT ALL ON public.dp_va_apuracoes TO service_role;