CREATE OR REPLACE FUNCTION public.dp_folgas_set_direito_origem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fixa int;
  v_dow int := extract(dow from NEW.data)::int;
  v_old_dow int;
  v_eff text;
BEGIN
  SELECT folga_fixa_dow INTO v_fixa FROM dp_colaborador_config_trabalho
   WHERE colaborador_id = NEW.colaborador_id
   ORDER BY vigencia_inicio DESC NULLS LAST LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.direito_origem IS NULL THEN
      IF NEW.origem = 'fixa_semana' OR (v_fixa IS NOT NULL AND v_dow = v_fixa) THEN
        NEW.direito_origem := 'fixa';
      ELSIF v_dow IN (0,6) THEN
        NEW.direito_origem := 'fds';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.data IS NOT DISTINCT FROM OLD.data
     OR NEW.direito_origem IS DISTINCT FROM OLD.direito_origem THEN
    RETURN NEW;
  END IF;

  v_old_dow := extract(dow from OLD.data)::int;
  v_eff := OLD.direito_origem;
  IF v_eff IS NULL THEN
    IF OLD.origem = 'fixa_semana' OR (v_fixa IS NOT NULL AND v_old_dow = v_fixa) THEN v_eff := 'fixa';
    ELSIF v_old_dow IN (0,6) THEN v_eff := 'fds';
    END IF;
  END IF;

  IF v_eff IN ('fds','dominical_deslocada') THEN
    NEW.direito_origem := CASE WHEN v_dow IN (0,6) THEN 'fds' ELSE 'dominical_deslocada' END;
  ELSIF v_eff IN ('fixa','folga_fixa_deslocada') THEN
    NEW.direito_origem := CASE WHEN v_fixa IS NOT NULL AND v_dow = v_fixa THEN 'fixa' ELSE 'folga_fixa_deslocada' END;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.dp_folgas_set_direito_origem() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dp_folgas_direito_origem ON public.dp_folgas;
CREATE TRIGGER trg_dp_folgas_direito_origem
BEFORE INSERT OR UPDATE OF data ON public.dp_folgas
FOR EACH ROW EXECUTE FUNCTION public.dp_folgas_set_direito_origem();