ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS turno_categoria_labels jsonb NOT NULL DEFAULT '{}'::jsonb;