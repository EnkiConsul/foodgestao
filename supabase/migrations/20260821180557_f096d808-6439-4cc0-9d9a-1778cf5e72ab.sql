ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS salario_familia_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assiduidade_ativa boolean NOT NULL DEFAULT true;