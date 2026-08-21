ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS va_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS vt_ativo boolean NOT NULL DEFAULT true;