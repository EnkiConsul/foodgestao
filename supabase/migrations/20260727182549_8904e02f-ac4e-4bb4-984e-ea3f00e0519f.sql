CREATE OR REPLACE FUNCTION public.dp_bloquear_cadastro_legado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Cadastro antigo de jornadas encerrado. Use Turnos e Configuracao de trabalho do colaborador.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_jornadas_legado ON public.dp_jornadas;
CREATE TRIGGER trg_dp_jornadas_legado
  BEFORE INSERT ON public.dp_jornadas
  FOR EACH ROW EXECUTE FUNCTION public.dp_bloquear_cadastro_legado();

DROP TRIGGER IF EXISTS trg_dp_colaborador_jornadas_legado ON public.dp_colaborador_jornadas;
CREATE TRIGGER trg_dp_colaborador_jornadas_legado
  BEFORE INSERT ON public.dp_colaborador_jornadas
  FOR EACH ROW EXECUTE FUNCTION public.dp_bloquear_cadastro_legado();