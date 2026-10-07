ALTER TABLE public.dp_atas
  ADD COLUMN IF NOT EXISTS condutores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publicar_mural boolean NOT NULL DEFAULT false;
ALTER TABLE public.dp_ata_participantes ALTER COLUMN colaborador_id DROP NOT NULL;
ALTER TABLE public.dp_ata_participantes
  ADD COLUMN IF NOT EXISTS avulso_nome text,
  ADD COLUMN IF NOT EXISTS avulso_cpf text,
  ADD COLUMN IF NOT EXISTS avulso_whatsapp text;
ALTER TABLE public.dp_ata_participantes DROP CONSTRAINT IF EXISTS dp_ata_part_pessoa_chk;
ALTER TABLE public.dp_ata_participantes ADD CONSTRAINT dp_ata_part_pessoa_chk
  CHECK (colaborador_id IS NOT NULL OR (avulso_nome IS NOT NULL AND length(trim(avulso_nome)) >= 3));