ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS alerta_ferias_dias smallint NOT NULL DEFAULT 60;