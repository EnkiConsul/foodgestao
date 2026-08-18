ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS assiduidade_considera_atestado boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assiduidade_max_atestados integer;

ALTER TABLE public.dp_folha_lancamentos
  ADD COLUMN IF NOT EXISTS assiduidade_atestado_abonado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assiduidade_abono_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assiduidade_abono_em timestamptz,
  ADD COLUMN IF NOT EXISTS assiduidade_abono_motivo text;