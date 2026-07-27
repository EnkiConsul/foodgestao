ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS tipo_descanso_domingo text NOT NULL DEFAULT 'legal',
  ADD COLUMN IF NOT EXISTS negociacao_id uuid REFERENCES public.dp_sindicato_negociacoes(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dp_config_dp_tipo_descanso_domingo_chk'
  ) THEN
    ALTER TABLE public.dp_config_dp
      ADD CONSTRAINT dp_config_dp_tipo_descanso_domingo_chk
      CHECK (tipo_descanso_domingo IN ('legal','acordo_coletivo'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dp_config_dp_acordo_requer_negociacao_chk'
  ) THEN
    ALTER TABLE public.dp_config_dp
      ADD CONSTRAINT dp_config_dp_acordo_requer_negociacao_chk
      CHECK (tipo_descanso_domingo <> 'acordo_coletivo' OR negociacao_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN public.dp_config_dp.tipo_descanso_domingo IS 'legal = folga dominical estrita; acordo_coletivo = domingo pode ser substituido por sabado conforme negociacao sindical vinculada';