ALTER TABLE public.dp_dia_trabalho_excepcional ADD COLUMN IF NOT EXISTS motivo TEXT;
COMMENT ON COLUMN public.dp_dia_trabalho_excepcional.motivo IS 'Justificativa do gestor para a exceção (ex.: cancelamento de folga fixa).';
