ALTER TABLE public.dp_desligamento_processos DROP CONSTRAINT dp_desligamento_processos_modalidade_check;
ALTER TABLE public.dp_desligamento_processos ADD CONSTRAINT dp_desligamento_processos_modalidade_check
  CHECK (modalidade = ANY (ARRAY['trabalhado','indenizado','misto','nao_aplicavel','dispensado_cumprimento']));
ALTER TABLE public.dp_desligamento_processos ADD CONSTRAINT dp_desligamento_dispensa_sem_indenizacao
  CHECK (modalidade <> 'dispensado_cumprimento' OR (coalesce(dias_indenizados,0) = 0 AND projecao_indenizada IS NULL));