CREATE OR REPLACE FUNCTION public.dp_trocas_exige_assinatura_solicitante()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.created_at >= '2026-10-04 22:30:00+00'
     AND NEW.solicitante_assinatura IS NULL
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status NOT IN ('cancelada','expirada','recusada','recusada_colega','recusada_gestor','pendente_colega') THEN
    RAISE EXCEPTION 'troca_sem_assinatura_solicitante' USING HINT = 'Quem pediu a troca precisa assinar digitalmente antes do aceite.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_dp_trocas_exige_assinatura ON public.dp_trocas;
CREATE TRIGGER trg_dp_trocas_exige_assinatura BEFORE UPDATE ON public.dp_trocas
FOR EACH ROW EXECUTE FUNCTION public.dp_trocas_exige_assinatura_solicitante();