CREATE OR REPLACE FUNCTION public.dp_ocorrencia_previsto(_colaborador_id uuid, _data date)
RETURNS TABLE(entrada time without time zone, saida time without time zone, unidade_id uuid, setor_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_entrada time; v_saida time; v_unidade uuid; v_setor uuid;
BEGIN
  SELECT i.entrada, i.saida, e.unidade_id
    INTO v_entrada, v_saida, v_unidade
  FROM public.dp_escala_itens i
  JOIN public.dp_escalas e ON e.id = i.escala_id
  WHERE i.colaborador_id = _colaborador_id AND i.data = _data AND i.tipo = 'trabalho'
  ORDER BY (e.status = 'publicada') DESC, i.updated_at DESC
  LIMIT 1;

  -- Sem escala para o dia: usa o horário habitual do dia da semana
  -- (quem tem horário fixo não deve ver "sem horário definido").
  IF v_entrada IS NULL THEN
    SELECT COALESCE(d.entrada, t.entrada), COALESCE(d.saida, t.saida)
      INTO v_entrada, v_saida
    FROM public.dp_colaborador_config_dias d
    JOIN public.dp_colaborador_config_trabalho c ON c.id = d.config_id
    LEFT JOIN public.dp_turnos t ON t.id = d.turno_id
    WHERE c.colaborador_id = _colaborador_id
      AND d.dow = EXTRACT(DOW FROM _data)::int
      AND d.trabalha
    ORDER BY c.updated_at DESC NULLS LAST
    LIMIT 1;
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