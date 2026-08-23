ALTER TYPE public.dp_folga_origem ADD VALUE IF NOT EXISTS 'automatica_clt';

ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS troca_folga_modo text NOT NULL DEFAULT 'aprovacao_admin',
  ADD COLUMN IF NOT EXISTS troca_folga_escopo text NOT NULL DEFAULT 'ambas';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dp_config_dp_troca_folga_modo_chk') THEN
    ALTER TABLE public.dp_config_dp
      ADD CONSTRAINT dp_config_dp_troca_folga_modo_chk
      CHECK (troca_folga_modo IN ('direta','aprovacao_admin','proibida'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dp_config_dp_troca_folga_escopo_chk') THEN
    ALTER TABLE public.dp_config_dp
      ADD CONSTRAINT dp_config_dp_troca_folga_escopo_chk
      CHECK (troca_folga_escopo IN ('semanal','dominical','ambas'));
  END IF;
END $$;