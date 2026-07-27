CREATE OR REPLACE FUNCTION public.dp_escala_auto_gerar(
  p_company_id uuid,
  p_mes date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_count integer := 0;
  r record;
  d date;
  v_dow smallint;
BEGIN
  FOR r IN
    SELECT c.id AS colaborador_id,
           COALESCE(cj.folga_fixa_semana_override, (j.dias_folga)[1]) AS dia_folga
      FROM public.dp_colaboradores c
      JOIN public.dp_colaborador_jornadas cj
        ON cj.colaborador_id = c.id
       AND cj.inicio <= v_fim
       AND (cj.fim IS NULL OR cj.fim >= v_inicio)
      JOIN public.dp_jornadas j ON j.id = cj.jornada_id
     WHERE c.company_id = p_company_id
       AND c.ativo = true
       AND (c.data_desligamento IS NULL OR c.data_desligamento >= v_inicio)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_folgas f
          WHERE f.colaborador_id = c.id
            AND f.data BETWEEN v_inicio AND v_fim
            AND f.status <> 'cancelada'
       )
  LOOP
    v_dow := r.dia_folga;
    IF v_dow IS NULL THEN
      CONTINUE;
    END IF;

    d := v_inicio;
    WHILE d <= v_fim LOOP
      IF EXTRACT(DOW FROM d)::smallint = v_dow
         AND NOT EXISTS (
           SELECT 1 FROM public.dp_datas_bloqueadas b
            WHERE b.company_id = p_company_id AND b.data = d AND b.liberada = false
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.dp_ferias_gozos g
            WHERE g.colaborador_id = r.colaborador_id
              AND g.status IN ('aprovado', 'em_gozo')
              AND d BETWEEN g.data_inicio AND g.data_fim
         )
      THEN
        INSERT INTO public.dp_folgas (company_id, colaborador_id, data, tipo, origem, status, observacao)
        VALUES (p_company_id, r.colaborador_id, d, 'normal', 'fixa_semana', 'agendada',
                'Escala gerada automaticamente')
        ON CONFLICT DO NOTHING;
        v_count := v_count + 1;
      END IF;
      d := d + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_escala_auto_gerar(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dp_escala_auto_gerar(uuid, date) TO service_role;

-- Roda para todas as empresas; só age no último dia do mês.
CREATE OR REPLACE FUNCTION public.dp_escala_auto_gerar_todas()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_total integer := 0;
  r record;
BEGIN
  IF v_hoje <> (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT DISTINCT company_id FROM public.dp_colaboradores WHERE ativo = true LOOP
    v_total := v_total + public.dp_escala_auto_gerar(r.company_id, (v_hoje + 1)::date);
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dp_escala_auto_gerar_todas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dp_escala_auto_gerar_todas() TO service_role;