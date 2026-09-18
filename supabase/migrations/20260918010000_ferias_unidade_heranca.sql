-- A unidade pode herdar a política de 13º da empresa; a política da empresa
-- continua obrigatória. Nenhuma linha ou outra configuração é removida.
ALTER TABLE public.dp_config_dp
  ALTER COLUMN ferias_adiantamento_13 DROP NOT NULL;
ALTER TABLE public.dp_config_dp
  ADD CONSTRAINT dp_config_dp_empresa_adiantamento_obrigatorio
  CHECK (unidade_id IS NOT NULL OR ferias_adiantamento_13 IS NOT NULL);
