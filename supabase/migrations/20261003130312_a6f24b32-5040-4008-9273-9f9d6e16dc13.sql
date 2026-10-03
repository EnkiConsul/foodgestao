CREATE OR REPLACE FUNCTION public.dp_folgas_set_direito_origem()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_fixa int;
  v_dow int := extract(dow from NEW.data)::int;
  v_old_dow int;
  v_eff text;
BEGIN
  -- Folga extra nunca consome folga fixa nem descanso de fim de semana.
  IF COALESCE(NEW.extra, false) THEN
    NEW.direito_origem := 'excecao_gestor';
    RETURN NEW;
  END IF;

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
END $function$;

DO $mig$
DECLARE d text; n text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p
   WHERE p.proname = 'dp_solicitacao_responder' AND p.pronamespace = 'public'::regnamespace;
  n := replace(d,
    $a$'agendada'::public.dp_folga_status, false, v_uid,
              CASE WHEN v_mudanca
                THEN 'Mudança da folga de ' || to_char(v_row.data_fim, 'DD/MM/YYYY') || ' aprovada pelo DP'
                ELSE 'Solicitação de folga aprovada pelo DP' END)$a$,
    $b$'agendada'::public.dp_folga_status, (NOT v_mudanca AND COALESCE(v_row.fora_da_janela, false)), v_uid,
              CASE WHEN v_mudanca
                THEN 'Mudança da folga de ' || to_char(v_row.data_fim, 'DD/MM/YYYY') || ' aprovada pelo DP'
                WHEN COALESCE(v_row.fora_da_janela, false)
                THEN 'Folga extra (exceção) aprovada pelo DP'
                ELSE 'Solicitação de folga aprovada pelo DP' END)$b$);
  IF n = d THEN RAISE EXCEPTION 'trecho de dp_solicitacao_responder não encontrado'; END IF;
  EXECUTE n;
END $mig$;