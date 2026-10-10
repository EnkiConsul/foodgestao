ALTER TABLE public.dp_pendencias_config
  ADD COLUMN IF NOT EXISTS alerta_recibo_assinatura_dias integer NOT NULL DEFAULT 5 CHECK (alerta_recibo_assinatura_dias BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS alerta_ata_assinatura_dias integer NOT NULL DEFAULT 7 CHECK (alerta_ata_assinatura_dias BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS alerta_preadmissao_dias integer NOT NULL DEFAULT 3 CHECK (alerta_preadmissao_dias BETWEEN 1 AND 30),
  ADD COLUMN IF NOT EXISTS alerta_contatos_emergencia boolean NOT NULL DEFAULT true;