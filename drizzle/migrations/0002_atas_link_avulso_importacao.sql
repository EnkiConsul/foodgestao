ALTER TABLE public.dp_atas
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'sistema' CHECK (origem IN ('sistema','importada','importada_assinada'));
ALTER TABLE public.dp_ata_participantes
  ADD COLUMN IF NOT EXISTS arquivo_path text,
  ADD COLUMN IF NOT EXISTS link_token_hash text,
  ADD COLUMN IF NOT EXISTS link_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinado_em timestamptz,
  ADD COLUMN IF NOT EXISTS assinatura_imagem text,
  ADD COLUMN IF NOT EXISTS assinatura_hash text,
  ADD COLUMN IF NOT EXISTS assinatura_ip text,
  ADD COLUMN IF NOT EXISTS assinatura_user_agent text;
CREATE UNIQUE INDEX IF NOT EXISTS dp_ata_part_link_idx ON public.dp_ata_participantes(link_token_hash) WHERE link_token_hash IS NOT NULL;
-- Campos de assinatura por link só são gravados pelo servidor.
REVOKE UPDATE (link_token_hash, link_expira_em, assinado_em, assinatura_imagem, assinatura_hash, assinatura_ip, assinatura_user_agent) ON public.dp_ata_participantes FROM authenticated;