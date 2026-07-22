CREATE UNIQUE INDEX IF NOT EXISTS dp_datas_bloqueadas_unique_global
  ON public.dp_datas_bloqueadas (company_id, data)
  WHERE unidade_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dp_datas_bloqueadas_unique_unidade
  ON public.dp_datas_bloqueadas (company_id, unidade_id, data)
  WHERE unidade_id IS NOT NULL;