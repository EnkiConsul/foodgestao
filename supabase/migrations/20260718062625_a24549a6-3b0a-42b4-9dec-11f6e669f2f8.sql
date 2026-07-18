ALTER TABLE public.dp_sindicato_negociacoes
  ADD COLUMN IF NOT EXISTS sindicato_laboral_id UUID REFERENCES public.dp_sindicatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS arquivo_nome TEXT;