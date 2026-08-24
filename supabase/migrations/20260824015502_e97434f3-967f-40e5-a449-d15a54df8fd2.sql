-- M8 (Convocações 3A.1) — dp_regime_convocavel + alteração cirúrgica do guard.
-- Definição anterior do guard preservada no comentário abaixo para rollback exato:
--   IF v_regime IS DISTINCT FROM 'intermitente' THEN RAISE EXCEPTION 'Convocações são exclusivas de colaboradores com contrato intermitente.'; END IF;
--   (restante idêntico)

CREATE OR REPLACE FUNCTION public.dp_regime_convocavel(_regime public.dp_regime_trabalho)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT _regime IN ('intermitente','freelancer');
$$;

REVOKE ALL ON FUNCTION public.dp_regime_convocavel(public.dp_regime_trabalho) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_regime_convocavel(public.dp_regime_trabalho) TO authenticated;

CREATE OR REPLACE FUNCTION public.dp_convocacao_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regime public.dp_regime_trabalho;
BEGIN
  SELECT regime INTO v_regime FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  -- ÚNICA alteração desta migration: comparação literal trocada pela regra central.
  IF NOT public.dp_regime_convocavel(v_regime) THEN
    RAISE EXCEPTION 'Convocações são exclusivas de colaboradores com contrato intermitente ou freelancer.';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status <> OLD.status AND NEW.status IN ('aceita','recusada') THEN
    NEW.respondida_em := COALESCE(NEW.respondida_em, now());
    IF OLD.prazo_resposta IS NOT NULL AND now() > OLD.prazo_resposta THEN
      RAISE EXCEPTION 'O prazo para responder esta convocação já expirou.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;