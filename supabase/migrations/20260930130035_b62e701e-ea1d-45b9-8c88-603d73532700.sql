CREATE OR REPLACE FUNCTION public.dp_folga_exige_descanso_fds(_company uuid, _colab uuid, _dias integer[], _competencia date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_cfg_id uuid;
  v_fixa int;
  v_dias_trab int[];
  v_dias_uso int[] := COALESCE(_dias, '{}'::int[]);
  v_ini date := date_trunc('month', COALESCE(_competencia, now()::date))::date;
  v_fim date := (date_trunc('month', COALESCE(_competencia, now()::date)) + interval '1 month - 1 day')::date;
BEGIN
  IF _company IS NULL OR _colab IS NULL THEN RETURN false; END IF;

  SELECT c.id, c.regime, c.vinculo_label, c.unidade_id, c.forma_pagamento
    INTO v_c
    FROM public.dp_colaboradores c
   WHERE c.id = _colab AND c.company_id = _company
     AND c.deleted_at IS NULL AND c.ativo IS NOT false;

  IF v_c.id IS NULL THEN RETURN false; END IF;

  -- CLT e freelancer mensalista (trabalha o mês todo) seguem a regra; demais vínculos não
  IF v_c.regime IS NOT NULL AND v_c.regime::text <> 'clt'
     AND NOT (v_c.regime::text = 'freelancer' AND COALESCE(v_c.forma_pagamento::text, '') = 'mensalista') THEN
    RETURN false;
  END IF;

  IF lower(COALESCE(v_c.vinculo_label, '')) IN ('socio', 'sócio') THEN RETURN false; END IF;

  SELECT t.id, t.folga_fixa_dow INTO v_cfg_id, v_fixa
    FROM public.dp_colaborador_config_trabalho t
   WHERE t.colaborador_id = _colab
     AND t.company_id = _company
     AND t.vigencia_fim IS NULL
   ORDER BY t.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  IF v_cfg_id IS NOT NULL THEN
    IF v_fixa = 0 THEN RETURN false; END IF;

    SELECT array_agg(d.dow ORDER BY d.dow) INTO v_dias_trab
      FROM public.dp_colaborador_config_dias d
     WHERE d.config_id = v_cfg_id AND d.trabalha IS TRUE;

    IF v_dias_trab IS NOT NULL AND array_length(v_dias_trab, 1) IS NOT NULL THEN
      IF NOT (0 = ANY (v_dias_trab)) THEN RETURN false; END IF;
      IF array_length(v_dias_uso, 1) IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM unnest(v_dias_uso) AS x WHERE x = ANY (v_dias_trab)) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;

  IF array_length(v_dias_uso, 1) IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.dp_ferias_gozos g
       WHERE g.colaborador_id = _colab
         AND g.status::text <> 'cancelado'
         AND g.data_inicio <= v_fim AND g.data_fim >= v_ini
    ) OR EXISTS (
      SELECT 1 FROM public.dp_folgas f
       WHERE f.colaborador_id = _colab
         AND f.status::text <> 'cancelada'
         AND f.tipo::text IN ('ferias', 'licenca')
         AND f.data BETWEEN v_ini AND v_fim
    ) THEN RETURN false; END IF;

    RETURN true;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM generate_series(v_ini, v_fim, interval '1 day') AS d
     WHERE EXTRACT(DOW FROM d)::int = ANY (v_dias_uso)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_ferias_gozos g
          WHERE g.colaborador_id = _colab
            AND g.status::text <> 'cancelado'
            AND d::date BETWEEN g.data_inicio AND g.data_fim)
       AND NOT EXISTS (
         SELECT 1 FROM public.dp_folgas f
          WHERE f.colaborador_id = _colab
            AND f.status::text <> 'cancelada'
            AND f.tipo::text IN ('ferias', 'licenca')
            AND f.data = d::date)
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;