ALTER TYPE public.dp_disciplinar_tipo ADD VALUE IF NOT EXISTS 'alinhamento_operacional';

CREATE OR REPLACE FUNCTION public.dp_disciplinar_guard_vinculo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_regime text;
BEGIN
  IF NEW.tipo::text NOT IN ('advertencia_verbal','advertencia_escrita','suspensao') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo = OLD.tipo AND NEW.colaborador_id = OLD.colaborador_id THEN
    RETURN NEW;
  END IF;
  SELECT lower(coalesce(regime::text,'')) INTO v_regime FROM public.dp_colaboradores WHERE id = NEW.colaborador_id;
  IF v_regime NOT IN ('clt','intermitente','temporario','aprendiz') THEN
    RAISE EXCEPTION 'Advertência e suspensão são exclusivas de vínculo de emprego. Para este vínculo, registre um Alinhamento Operacional.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.dp_disciplinar_guard_vinculo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_disciplinar_guard_vinculo ON public.dp_registros_disciplinares;
CREATE TRIGGER trg_dp_disciplinar_guard_vinculo
BEFORE INSERT OR UPDATE OF tipo, colaborador_id ON public.dp_registros_disciplinares
FOR EACH ROW EXECUTE FUNCTION public.dp_disciplinar_guard_vinculo();