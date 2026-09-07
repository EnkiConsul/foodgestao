ALTER TABLE public.dp_indisponibilidades
  ADD COLUMN IF NOT EXISTS conflito boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conflito_convocacao_id uuid REFERENCES public.dp_convocacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conflito_resolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conflito_resolvido_por uuid,
  ADD COLUMN IF NOT EXISTS ciencia_multa_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_dp_indisponibilidades_conflito
  ON public.dp_indisponibilidades(company_id, data)
  WHERE conflito AND cancelada_em IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
     JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'dp_notificacao_tipo'
      AND e.enumlabel = 'disponibilidade_conflito_convocacao'
  ) THEN
    ALTER TYPE public.dp_notificacao_tipo ADD VALUE 'disponibilidade_conflito_convocacao';
  END IF;
END$$;
