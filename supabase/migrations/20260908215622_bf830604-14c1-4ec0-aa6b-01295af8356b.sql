ALTER TABLE public.dp_config_dp
  ADD COLUMN IF NOT EXISTS ferias_sinalizacao_ciclo_encerrado text NOT NULL DEFAULT 'a_conceder';

CREATE OR REPLACE FUNCTION public.dp_config_dp_valida_sinalizacao_ferias()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ferias_sinalizacao_ciclo_encerrado IS NULL THEN
    NEW.ferias_sinalizacao_ciclo_encerrado := 'a_conceder';
  END IF;
  IF NEW.ferias_sinalizacao_ciclo_encerrado NOT IN ('legal', 'a_conceder', 'vencido') THEN
    RAISE EXCEPTION 'FERIAS_SINALIZACAO_INVALIDA';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dp_config_dp_valida_sinalizacao_ferias ON public.dp_config_dp;
CREATE TRIGGER trg_dp_config_dp_valida_sinalizacao_ferias
  BEFORE INSERT OR UPDATE ON public.dp_config_dp
  FOR EACH ROW EXECUTE FUNCTION public.dp_config_dp_valida_sinalizacao_ferias();