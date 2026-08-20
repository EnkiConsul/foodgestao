ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS vale_transporte_dia_pagamento integer,
  ADD COLUMN IF NOT EXISTS vale_transporte_dias_corte integer,
  ADD COLUMN IF NOT EXISTS vale_transporte_desconta_falta boolean,
  ADD COLUMN IF NOT EXISTS vale_transporte_desconta_folga_extra boolean,
  ADD COLUMN IF NOT EXISTS vale_transporte_desconta_atestado boolean,
  ADD COLUMN IF NOT EXISTS vale_transporte_desconta_ferias boolean;

ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS vt_dia_pagamento integer,
  ADD COLUMN IF NOT EXISTS vt_dias_corte integer,
  ADD COLUMN IF NOT EXISTS vt_desconta_falta boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS vt_desconta_folga_extra boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS vt_desconta_atestado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vt_desconta_ferias boolean DEFAULT true;