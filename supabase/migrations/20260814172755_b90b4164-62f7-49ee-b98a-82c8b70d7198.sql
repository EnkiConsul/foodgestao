ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS base_salarial numeric,
  ADD COLUMN IF NOT EXISTS base_horas_mes numeric DEFAULT 220,
  ADD COLUMN IF NOT EXISTS base_dias_mes numeric DEFAULT 30,
  ADD COLUMN IF NOT EXISTS valor_hora_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premio_assiduidade boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS premio_assiduidade_valor numeric,
  ADD COLUMN IF NOT EXISTS assiduidade_criterio text,
  ADD COLUMN IF NOT EXISTS assiduidade_tolerancia_min integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assiduidade_max_atrasos integer;

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_assiduidade_criterio_check;

ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_assiduidade_criterio_check
  CHECK (assiduidade_criterio IS NULL OR assiduidade_criterio IN ('sem_faltas_sem_atrasos','sem_faltas','proporcional'));