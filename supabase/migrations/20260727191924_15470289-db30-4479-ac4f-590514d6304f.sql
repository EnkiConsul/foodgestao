CREATE UNIQUE INDEX IF NOT EXISTS dp_folha_lancamentos_periodo_colab_tipo_key
  ON public.dp_folha_lancamentos (periodo_id, colaborador_id, tipo);