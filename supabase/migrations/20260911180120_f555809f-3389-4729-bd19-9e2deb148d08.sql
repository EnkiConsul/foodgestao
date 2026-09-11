ALTER TABLE public.dp_solicitacoes
  ADD COLUMN IF NOT EXISTS retorno_em date,
  ADD COLUMN IF NOT EXISTS retorno_confirmado_em timestamptz,
  ADD COLUMN IF NOT EXISTS retorno_confirmado_por uuid;