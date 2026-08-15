ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS vale_alimentacao_dias_origem text NOT NULL DEFAULT 'jornada';

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_va_dias_origem_chk;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_va_dias_origem_chk
  CHECK (vale_alimentacao_dias_origem IN ('jornada', 'fixo'));