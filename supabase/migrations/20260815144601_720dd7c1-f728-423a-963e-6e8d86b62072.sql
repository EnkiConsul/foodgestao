ALTER TABLE public.dp_colaborador_config_dias
  ADD COLUMN IF NOT EXISTS entrada time without time zone,
  ADD COLUMN IF NOT EXISTS saida time without time zone,
  ADD COLUMN IF NOT EXISTS intervalo_minutos integer;

ALTER TABLE public.dp_colaborador_config_dias
  DROP CONSTRAINT IF EXISTS dp_colab_config_dias_horario_coerente;

ALTER TABLE public.dp_colaborador_config_dias
  ADD CONSTRAINT dp_colab_config_dias_horario_coerente CHECK (
    (entrada IS NULL AND saida IS NULL AND intervalo_minutos IS NULL)
    OR (entrada IS NOT NULL AND saida IS NOT NULL AND intervalo_minutos IS NOT NULL)
  );

ALTER TABLE public.dp_colaborador_config_dias
  DROP CONSTRAINT IF EXISTS dp_colab_config_dias_intervalo_valido;

ALTER TABLE public.dp_colaborador_config_dias
  ADD CONSTRAINT dp_colab_config_dias_intervalo_valido CHECK (
    intervalo_minutos IS NULL OR (intervalo_minutos >= 0 AND intervalo_minutos <= 480)
  );

COMMENT ON COLUMN public.dp_colaborador_config_dias.entrada IS
  'Horário próprio deste dia (exceção). Quando nulo, vale o turno do dia/padrão.';