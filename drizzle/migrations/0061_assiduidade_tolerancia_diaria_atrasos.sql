COMMENT ON COLUMN public.dp_colaboradores.assiduidade_tolerancia_min IS 'Tolerância diária acumulada (entrada + retorno do intervalo) em minutos.';
COMMENT ON COLUMN public.dp_colaboradores.assiduidade_max_atrasos IS 'Máximo de dias com atraso acima da tolerância no mês antes de ir à decisão do gestor.';

CREATE OR REPLACE FUNCTION private.dp_assiduidade_risco(_colaborador_id uuid, _tipo dp_ocorrencia_tipo, _minutos integer DEFAULT NULL::integer)
 RETURNS TABLE(risco boolean, motivo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record;
BEGIN
  SELECT premio_assiduidade, premio_assiduidade_valor, vinculo_label INTO c
    FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF c IS NULL OR COALESCE(c.premio_assiduidade,false) = false
     OR COALESCE(c.premio_assiduidade_valor,0) <= 0
     OR lower(COALESCE(c.vinculo_label,'')) IN ('socio','sócio') THEN
    RETURN QUERY SELECT false, NULL::text; RETURN;
  END IF;
  IF _tipo IN ('falta','previsao_falta') THEN
    RETURN QUERY SELECT true, 'Falta registrada — por padrão perde o prêmio de assiduidade; o gestor decide.'::text; RETURN;
  END IF;
  IF _tipo = 'atestado' THEN
    RETURN QUERY SELECT true, 'Atestado apresentado — por padrão perde o prêmio de assiduidade; o gestor pode abonar.'::text; RETURN;
  END IF;
  IF _tipo IN ('saida_antecipada','previsao_saida_antecipada') THEN
    RETURN QUERY SELECT true, 'Saída antecipada — por padrão perde o prêmio de assiduidade; o gestor decide.'::text; RETURN;
  END IF;
  -- Atrasos de entrada/intervalo: decididos pela apuração diária/mensal (dp_assiduidade_recalcular_atrasos).
  RETURN QUERY SELECT false, NULL::text;
END;
$function$;

CREATE OR REPLACE FUNCTION private.dp_assiduidade_recalcular_atrasos(_colaborador_id uuid, _data date)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c record; v_tol int; v_max int; d record; v_ord int := 0; v_risco boolean; v_motivo text; o record;
BEGIN
  SELECT premio_assiduidade, premio_assiduidade_valor, vinculo_label,
         assiduidade_tolerancia_min, assiduidade_max_atrasos INTO c
    FROM public.dp_colaboradores WHERE id = _colaborador_id;
  IF c IS NULL THEN RETURN; END IF;
  v_tol := GREATEST(COALESCE(c.assiduidade_tolerancia_min, 10), 0);
  v_max := GREATEST(COALESCE(c.assiduidade_max_atrasos, 2), 0);

  FOR d IN
    SELECT data_operacional AS dia,
           SUM(COALESCE(minutos, 0)) AS total,
           bool_or(minutos IS NULL) AS sem_min
      FROM public.dp_ocorrencias
     WHERE colaborador_id = _colaborador_id
       AND date_trunc('month', data_operacional) = date_trunc('month', _data)
       AND estado <> 'cancelada'
       AND tipo IN ('atraso','previsao_atraso','atraso_intervalo','previsao_atraso_intervalo')
     GROUP BY data_operacional ORDER BY data_operacional
  LOOP
    v_risco := false; v_motivo := NULL;
    IF COALESCE(c.premio_assiduidade,false) AND COALESCE(c.premio_assiduidade_valor,0) > 0
       AND lower(COALESCE(c.vinculo_label,'')) NOT IN ('socio','sócio')
       AND (d.sem_min OR d.total > v_tol) THEN
      v_ord := v_ord + 1;
      IF v_ord > v_max THEN
        v_risco := true;
        v_motivo := format('%s atraso(s) acima da tolerância no mês (limite: %s). Neste dia: %s min somando entrada e retorno do intervalo (tolerância: %s min) — por padrão perde o prêmio; o gestor decide.',
                           v_ord, v_max, d.total, v_tol);
      END IF;
    END IF;
    FOR o IN SELECT id, company_id, assiduidade_risco, assiduidade_risco_motivo FROM public.dp_ocorrencias
              WHERE colaborador_id = _colaborador_id AND data_operacional = d.dia AND estado <> 'cancelada'
                AND assiduidade_decidido_em IS NULL
                AND tipo IN ('atraso','previsao_atraso','atraso_intervalo','previsao_atraso_intervalo')
    LOOP
      IF COALESCE(o.assiduidade_risco,false) IS DISTINCT FROM v_risco
         OR COALESCE(o.assiduidade_risco_motivo,'') IS DISTINCT FROM COALESCE(v_motivo,'') THEN
        UPDATE public.dp_ocorrencias SET
          assiduidade_risco = v_risco,
          assiduidade_risco_motivo = v_motivo,
          impacta_assiduidade = CASE WHEN v_risco THEN 'aguardando'::public.dp_ocorrencia_impacto ELSE 'nao'::public.dp_ocorrencia_impacto END
        WHERE id = o.id;
        INSERT INTO public.dp_ocorrencia_eventos (company_id, ocorrencia_id, tipo_evento, campo, valor_anterior, valor_novo, metadata, autor_id)
        VALUES (o.company_id, o.id, 'assiduidade_risco', 'assiduidade_risco',
                COALESCE(o.assiduidade_risco,false)::text, v_risco::text,
                jsonb_build_object('motivo', v_motivo, 'origem', 'apuracao_atrasos'), auth.uid());
      END IF;
    END LOOP;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION private.dp_ocorrencia_atrasos_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM private.dp_assiduidade_recalcular_atrasos(NEW.colaborador_id, NEW.data_operacional);
  END IF;
  IF TG_OP <> 'INSERT' AND (TG_OP = 'DELETE' OR date_trunc('month', OLD.data_operacional) <> date_trunc('month', NEW.data_operacional)) THEN
    PERFORM private.dp_assiduidade_recalcular_atrasos(OLD.colaborador_id, OLD.data_operacional);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS dp_ocorrencia_atrasos_aiud ON public.dp_ocorrencias;
CREATE TRIGGER dp_ocorrencia_atrasos_aiud
AFTER INSERT OR DELETE OR UPDATE OF tipo, minutos, estado, data_operacional ON public.dp_ocorrencias
FOR EACH ROW EXECUTE FUNCTION private.dp_ocorrencia_atrasos_trg();

REVOKE ALL ON FUNCTION private.dp_assiduidade_recalcular_atrasos(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.dp_ocorrencia_atrasos_trg() FROM PUBLIC;