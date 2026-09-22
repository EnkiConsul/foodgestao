ALTER TABLE public.dp_va_apuracoes
  ADD COLUMN IF NOT EXISTS dias_previstos_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dias_previstos_calculado integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dp_va_apuracoes'::regclass
      AND conname = 'dp_va_apuracoes_dias_previstos_chk'
  ) THEN
    ALTER TABLE public.dp_va_apuracoes
      ADD CONSTRAINT dp_va_apuracoes_dias_previstos_chk
      CHECK (dias_previstos BETWEEN 0 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dp_va_apuracoes'::regclass
      AND conname = 'dp_va_apuracoes_dias_previstos_calculado_chk'
  ) THEN
    ALTER TABLE public.dp_va_apuracoes
      ADD CONSTRAINT dp_va_apuracoes_dias_previstos_calculado_chk
      CHECK (dias_previstos_calculado IS NULL OR dias_previstos_calculado BETWEEN 0 AND 31);
  END IF;
END $$;

COMMENT ON COLUMN public.dp_va_apuracoes.dias_previstos_manual IS
  'Dias a trabalhar do ciclo atual informados pelo gestor (não recalculam pela escala).';
COMMENT ON COLUMN public.dp_va_apuracoes.dias_previstos_calculado IS
  'Dias a trabalhar apurados pelo sistema no momento da gravação (escala, convocações ou jornada).';