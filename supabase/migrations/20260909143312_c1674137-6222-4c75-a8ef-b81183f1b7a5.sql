ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS exigir_contracheque_mes_desligamento boolean NOT NULL DEFAULT false;