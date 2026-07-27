-- 1) Unidade opcional em dp_config_dp (regra padrão = unidade_id NULL)
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.dp_unidades(id) ON DELETE CASCADE;

-- remover unicidade antiga por company_id (constraint ou índice)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.dp_config_dp'::regclass
      AND contype IN ('u','p')
      AND pg_get_constraintdef(oid) = 'UNIQUE (company_id)'
  LOOP
    EXECUTE format('ALTER TABLE public.dp_config_dp DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS dp_config_dp_company_default_uidx
  ON public.dp_config_dp (company_id) WHERE unidade_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dp_config_dp_company_unidade_uidx
  ON public.dp_config_dp (company_id, unidade_id) WHERE unidade_id IS NOT NULL;

-- 2) Novas colunas de regra
ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS dias_descanso_negociados smallint[] NOT NULL DEFAULT '{0}',
  ADD COLUMN IF NOT EXISTS modo_frequencia_domingo text NOT NULL DEFAULT 'semanas',
  ADD COLUMN IF NOT EXISTS domingos_por_mes numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS modo_frequencia_domingo_mulher text NOT NULL DEFAULT 'semanas',
  ADD COLUMN IF NOT EXISTS domingos_por_mes_mulher numeric NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dp_config_dp'::regclass AND conname = 'dp_config_dp_modo_freq_chk'
  ) THEN
    ALTER TABLE public.dp_config_dp
      ADD CONSTRAINT dp_config_dp_modo_freq_chk
      CHECK (modo_frequencia_domingo IN ('semanas','por_mes')
         AND modo_frequencia_domingo_mulher IN ('semanas','por_mes'));
  END IF;
END $$;

-- 3) Regra efetiva por unidade (unidade sobrepõe empresa)
CREATE OR REPLACE FUNCTION public.dp_config_resolvida(_company_id uuid, _unidade_id uuid DEFAULT NULL)
RETURNS public.dp_config_dp
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.*
  FROM public.dp_config_dp c
  WHERE c.company_id = _company_id
    AND (c.unidade_id = _unidade_id OR c.unidade_id IS NULL)
  ORDER BY (c.unidade_id IS NOT NULL) DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.dp_config_resolvida(uuid, uuid) TO authenticated, service_role;