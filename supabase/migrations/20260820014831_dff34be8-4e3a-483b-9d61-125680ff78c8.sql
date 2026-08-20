ALTER TABLE public.dp_cargos
  ADD COLUMN IF NOT EXISTS insalubridade_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS periculosidade_percentual numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_horas_mes numeric NOT NULL DEFAULT 220,
  ADD COLUMN IF NOT EXISTS base_dias_mes numeric NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.dp_cargos.insalubridade_percentual IS 'Percentual padrão de insalubridade do cargo (herdado pelo colaborador)';
COMMENT ON COLUMN public.dp_cargos.periculosidade_percentual IS 'Percentual padrão de periculosidade do cargo (herdado pelo colaborador)';
COMMENT ON COLUMN public.dp_cargos.base_horas_mes IS 'Base de horas/mês do cargo para valor-hora';
COMMENT ON COLUMN public.dp_cargos.base_dias_mes IS 'Base de dias/mês do cargo para valor-dia';