CREATE OR REPLACE FUNCTION public.dp_ocorrencia_previsto(_colaborador_id uuid, _data date)
 RETURNS TABLE(entrada time without time zone, saida time without time zone, unidade_id uuid, setor_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_entrada time; v_saida time; v_unidade uuid; v_setor uuid; v_cfg uuid; v_turno uuid;
BEGIN
  SELECT i.entrada, i.saida, e.unidade_id
    INTO v_entrada, v_saida, v_unidade
  FROM public.dp_escala_itens i
  JOIN public.dp_escalas e ON e.id = i.escala_id
  WHERE i.colaborador_id = _colaborador_id AND i.data = _data AND i.tipo = 'trabalho'
  ORDER BY (e.status = 'publicada') DESC, i.updated_at DESC
  LIMIT 1;

  IF v_entrada IS NULL THEN
    -- Só a configuração vigente na data (nunca uma antiga encerrada).
    SELECT c.id, c.turno_padrao_id INTO v_cfg, v_turno
    FROM public.dp_colaborador_config_trabalho c
    WHERE c.colaborador_id = _colaborador_id
      AND c.vigencia_inicio <= _data
      AND (c.vigencia_fim IS NULL OR c.vigencia_fim >= _data)
    ORDER BY c.vigencia_inicio DESC, c.updated_at DESC NULLS LAST
    LIMIT 1;

    IF v_cfg IS NOT NULL THEN
      SELECT COALESCE(d.entrada, t.entrada, tp.entrada), COALESCE(d.saida, t.saida, tp.saida)
        INTO v_entrada, v_saida
      FROM public.dp_colaborador_config_dias d
      LEFT JOIN public.dp_turnos t ON t.id = d.turno_id
      LEFT JOIN public.dp_turnos tp ON tp.id = v_turno
      WHERE d.config_id = v_cfg AND d.dow = EXTRACT(DOW FROM _data)::int AND d.trabalha;

      -- Dia de folga habitual trabalhado (ex.: troca de folga): mantém o horário habitual.
      IF v_entrada IS NULL THEN
        SELECT COALESCE(d.entrada, t.entrada, tp.entrada), COALESCE(d.saida, t.saida, tp.saida)
          INTO v_entrada, v_saida
        FROM public.dp_colaborador_config_dias d
        LEFT JOIN public.dp_turnos t ON t.id = d.turno_id
        LEFT JOIN public.dp_turnos tp ON tp.id = v_turno
        WHERE d.config_id = v_cfg AND d.trabalha
          AND COALESCE(d.entrada, t.entrada, tp.entrada) IS NOT NULL
        ORDER BY ((d.dow - EXTRACT(DOW FROM _data)::int + 7) % 7)
        LIMIT 1;
      END IF;

      IF v_entrada IS NULL AND v_turno IS NOT NULL THEN
        SELECT t.entrada, t.saida INTO v_entrada, v_saida FROM public.dp_turnos t WHERE t.id = v_turno;
      END IF;
    END IF;
  END IF;

  IF v_unidade IS NULL THEN
    SELECT c.unidade_id INTO v_unidade FROM public.dp_colaboradores c WHERE c.id = _colaborador_id;
  END IF;

  BEGIN
    v_setor := public.dp_setor_previsto_id(_colaborador_id, _data);
  EXCEPTION WHEN OTHERS THEN v_setor := NULL;
  END;

  RETURN QUERY SELECT v_entrada, v_saida, v_unidade, v_setor;
END;
$function$;