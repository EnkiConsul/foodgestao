DROP INDEX IF EXISTS public.dp_datas_bloqueadas_unique_global;
DROP INDEX IF EXISTS public.dp_datas_bloqueadas_unique_unidade;
DROP INDEX IF EXISTS public.dp_datas_bloq_unique;

ALTER TABLE public.dp_datas_bloqueadas
  ADD CONSTRAINT dp_datas_bloqueadas_company_unidade_data_key
  UNIQUE NULLS NOT DISTINCT (company_id, unidade_id, data);