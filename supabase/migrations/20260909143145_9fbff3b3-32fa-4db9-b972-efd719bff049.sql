ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS exigir_contracheque_mes_desligamento boolean NOT NULL DEFAULT false;