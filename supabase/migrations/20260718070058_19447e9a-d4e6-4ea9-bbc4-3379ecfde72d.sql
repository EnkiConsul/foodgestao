ALTER TABLE public.dp_modelos_mensagem
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS assunto text;