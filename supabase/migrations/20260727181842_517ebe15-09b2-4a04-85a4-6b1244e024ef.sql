ALTER TABLE public.dp_cobertura_minima
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES public.dp_turnos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS vigencia_fim date;

CREATE INDEX IF NOT EXISTS idx_dp_cobertura_minima_turno
  ON public.dp_cobertura_minima (company_id, turno_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_dp_cobertura_minima_unidade
  ON public.dp_cobertura_minima (company_id, unidade_id) WHERE ativo;