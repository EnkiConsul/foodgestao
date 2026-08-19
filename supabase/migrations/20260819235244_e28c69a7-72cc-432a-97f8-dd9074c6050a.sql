ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS insalubridade_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periculosidade_percentual numeric NOT NULL DEFAULT 0;

ALTER TABLE public.dp_cargos
  ADD COLUMN IF NOT EXISTS insalubre boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS perigoso boolean NOT NULL DEFAULT false;

-- Backfill: o percentual único vira insalubridade quando o cargo é insalubre,
-- senão periculosidade.
UPDATE public.dp_colaboradores c
SET insalubridade_percentual = COALESCE(c.adicional_percentual, 0)
WHERE COALESCE(c.adicional_percentual, 0) > 0
  AND c.insalubridade_percentual = 0
  AND c.periculosidade_percentual = 0
  AND COALESCE(c.adicional_percentual, 0) <> 30;

UPDATE public.dp_colaboradores c
SET periculosidade_percentual = COALESCE(c.adicional_percentual, 0)
WHERE COALESCE(c.adicional_percentual, 0) = 30
  AND c.insalubridade_percentual = 0
  AND c.periculosidade_percentual = 0;

UPDATE public.dp_cargos SET insalubre = true WHERE insalubre_periculoso IS TRUE AND insalubre = false AND perigoso = false;