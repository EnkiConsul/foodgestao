CREATE OR REPLACE FUNCTION public.dp_portal_minhas_jornadas()
 RETURNS TABLE(dow integer, trabalha boolean, entrada text, saida text, intervalo_minutos integer, minutos_liquidos integer, origem text, incompleto boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- SECURITY DEFINER: o colaborador do portal não lê dp_turnos por RLS; a função
-- devolve só os horários do próprio cadastro, sem ampliar acesso à tabela.
DECLARE
  v_colab uuid;
  v_company uuid;
  v_cfg uuid;
  v_padrao uuid;
  v_fixa smallint;
BEGIN
  v_colab := public.dp_meu_colaborador();
  IF v_colab IS NULL THEN RETURN; END IF;

  SELECT c.company_id INTO v_company
    FROM public.dp_colaboradores c
    JOIN public.companies co ON co.id = c.company_id
   WHERE c.id = v_colab AND co.is_active = true;
  IF v_company IS NULL THEN RETURN; END IF;

  SELECT ct.id, ct.turno_padrao_id, ct.folga_fixa_dow
    INTO v_cfg, v_padrao, v_fixa
    FROM public.dp_colaborador_config_trabalho ct
   WHERE ct.colaborador_id = v_colab
     AND ct.company_id = v_company
     AND ct.vigencia_inicio <= CURRENT_DATE
     AND (ct.vigencia_fim IS NULL OR ct.vigencia_fim >= CURRENT_DATE)
   ORDER BY ct.vigencia_inicio DESC, ct.created_at DESC, ct.id DESC
   LIMIT 1;
  IF v_cfg IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.dow::integer AS dow,
           (d.trabalha AND NOT (v_fixa IS NOT NULL AND d.dow = v_fixa)) AS trab,
           (d.entrada IS NOT NULL AND d.saida IS NOT NULL) AS proprio,
           d.turno_id IS NOT NULL AS tem_turno_dia,
           d.entrada AS p_e, d.saida AS p_s, d.intervalo_minutos AS p_i,
           t.id AS t_id, t.entrada AS t_e, t.saida AS t_s, t.intervalo_minutos AS t_i
      FROM public.dp_colaborador_config_dias d
      LEFT JOIN public.dp_turnos t
        ON t.id = COALESCE(d.turno_id, v_padrao)
       AND t.company_id = v_company
     WHERE d.config_id = v_cfg
       AND d.company_id = v_company
  ),
  res AS (
    SELECT b.dow, b.trab,
           CASE WHEN NOT b.trab THEN 'folga'
                WHEN b.proprio THEN 'proprio'
                WHEN b.t_id IS NULL THEN 'sem_horario'
                WHEN b.tem_turno_dia THEN 'turno_do_dia'
                ELSE 'turno_padrao' END AS org,
           CASE WHEN b.proprio THEN b.p_e ELSE b.t_e END AS e,
           CASE WHEN b.proprio THEN b.p_s ELSE b.t_s END AS s,
           GREATEST(0, COALESCE(
             CASE WHEN b.proprio THEN COALESCE(b.p_i, b.t_i) ELSE b.t_i END, 0)) AS i
      FROM base b
  ),
  calc AS (
    SELECT r.*,
           CASE WHEN r.e IS NULL OR r.s IS NULL THEN 0
                ELSE (pg_catalog.date_part('hour', r.s)::int * 60 + pg_catalog.date_part('minute', r.s)::int)
                   - (pg_catalog.date_part('hour', r.e)::int * 60 + pg_catalog.date_part('minute', r.e)::int)
           END AS dif
      FROM res r
  )
  SELECT c.dow,
         c.trab,
         CASE WHEN c.trab AND c.e IS NOT NULL THEN pg_catalog.to_char(c.e, 'HH24:MI') END,
         CASE WHEN c.trab AND c.s IS NOT NULL THEN pg_catalog.to_char(c.s, 'HH24:MI') END,
         CASE WHEN c.trab THEN c.i ELSE 0 END,
         CASE WHEN NOT c.trab OR c.e IS NULL OR c.s IS NULL THEN 0
              ELSE GREATEST(0, (CASE WHEN c.dif <= 0 THEN c.dif + 1440 ELSE c.dif END) - c.i) END,
         c.org,
         (c.trab AND (c.e IS NULL OR c.s IS NULL
            OR ((CASE WHEN c.dif <= 0 THEN c.dif + 1440 ELSE c.dif END) - c.i) <= 0))
    FROM calc c
   ORDER BY c.dow;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_portal_minhas_jornadas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_portal_minhas_jornadas() TO authenticated, service_role;