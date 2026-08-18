-- Folha: adicional por tempo de serviço e salário-família entram como
-- rubricas automáticas no contracheque mensal.
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_lancamentos(_periodo_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_comp_txt text;
  v_ini date;
  v_fim date;
  v_count int := 0;
  v_base numeric(14,2);
  v_valor numeric(14,2);
  v_adiant numeric(14,2);
  v_horas numeric(12,2);
  v_dias int;
  v_vt_bruto numeric(14,2);
  v_vt_desc numeric(14,2);
  v_extras jsonb;
  v_regra record;
  v_meses int;
  v_ciclos int;
  v_perc numeric(10,3);
  v_adic numeric(14,2);
  v_sf_cota numeric(14,2);
  v_sf_teto numeric(14,2);
  v_sf_vig date;
  v_adic_ativo boolean;
  v_sf_qtd int;
  r record;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = _periodo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado'; END IF;

  IF NOT (private.is_company_admin_or_owner(auth.uid(), v_periodo.company_id)
          OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_periodo.company_id AND c.user_id = auth.uid())
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  v_comp_txt := to_char(v_periodo.competencia, 'YYYY-MM');
  v_ini := date_trunc('month', v_periodo.competencia)::date;
  v_fim := (v_ini + interval '1 month - 1 day')::date;

  SELECT salario_familia_cota, salario_familia_teto, salario_familia_vigencia,
         COALESCE(adicional_tempo_servico_ativo, false)
    INTO v_sf_cota, v_sf_teto, v_sf_vig, v_adic_ativo
    FROM public.dp_config_dp
   WHERE company_id = v_periodo.company_id AND unidade_id IS NULL
   LIMIT 1;
  v_adic_ativo := COALESCE(v_adic_ativo, false);

  FOR r IN
    SELECT dc.id,
           dc.forma_pagamento,
           COALESCE(dc.salario_base, cg.salario_base, 0) AS salario_base,
           COALESCE(dc.valor_hora, 0) AS valor_hora,
           dc.dependentes_irrf,
           dc.adicional_percentual,
           dc.vale_transporte,
           COALESCE(dc.vale_transporte_valor_dia, 0) AS vt_dia,
           dc.data_admissao,
           dc.cargo_id,
           dc.unidade_id,
           dc.sindicato_id,
           dc.adicional_tempo_servico_manual,
           COALESCE(dc.adicional_tempo_servico_override, false) AS adic_override
    FROM public.dp_colaboradores dc
    LEFT JOIN public.dp_cargos cg ON cg.id = dc.cargo_id
    WHERE dc.company_id = v_periodo.company_id
      AND dc.ativo = true
      AND dc.regime <> 'freelancer'
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_folha_lancamentos l
        WHERE l.periodo_id = _periodo_id AND l.colaborador_id = dc.id AND l.tipo = v_periodo.tipo
      )
  LOOP
    IF r.forma_pagamento = 'horista' THEN
      SELECT COALESCE(f.minutos_trabalhados, 0) / 60.0 INTO v_horas
        FROM public.dp_ponto_fechamentos f
       WHERE f.colaborador_id = r.id AND f.competencia = v_comp_txt;
      v_base := round(COALESCE(v_horas, 0) * r.valor_hora, 2);
    ELSIF r.forma_pagamento = 'diarista' THEN
      SELECT COUNT(DISTINCT p.data) INTO v_dias
        FROM public.dp_pontos p
       WHERE p.colaborador_id = r.id AND p.data BETWEEN v_ini AND v_fim;
      v_base := round(COALESCE(v_dias, 0) * r.salario_base, 2);
    ELSE
      v_base := r.salario_base;
    END IF;

    IF COALESCE(r.adicional_percentual, 0) > 0 THEN
      v_base := round(v_base * (1 + r.adicional_percentual / 100.0), 2);
    END IF;

    v_valor := v_base;
    IF v_periodo.tipo = 'adiantamento' THEN
      v_valor := round(v_base * 0.40, 2);
    ELSIF v_periodo.tipo = 'contracheque_mensal' THEN
      SELECT COALESCE(SUM(valor_liquido),0) INTO v_adiant
        FROM public.dp_folha_lancamentos la
        JOIN public.dp_folha_periodos pa ON pa.id = la.periodo_id
       WHERE la.colaborador_id = r.id
         AND pa.tipo = 'adiantamento'
         AND pa.competencia = v_periodo.competencia;
      v_valor := GREATEST(v_base - v_adiant, 0);
    ELSIF v_periodo.tipo = 'contracheque_quinzenal' THEN
      v_valor := round(v_base / 2.0, 2);
    ELSIF v_periodo.tipo = 'decimo_terceiro' THEN
      v_valor := round(v_base / 2.0, 2);
    END IF;

    v_extras := '[]'::jsonb;

    IF v_periodo.tipo = 'contracheque_mensal' THEN
      -- Adicional por tempo de serviço (anuênio/triênio/quinquênio)
      v_adic := 0;
      IF r.adic_override AND COALESCE(r.adicional_tempo_servico_manual, 0) > 0 THEN
        v_adic := round(r.adicional_tempo_servico_manual, 2);
        v_extras := v_extras || jsonb_build_array(jsonb_build_object(
          'descricao', 'Adicional por tempo de serviço',
          'natureza', 'provento', 'valor', v_adic, 'tributavel', true));
      ELSIF v_adic_ativo AND r.data_admissao IS NOT NULL THEN
        SELECT a.* INTO v_regra
          FROM public.dp_adicionais_tempo_servico a
         WHERE a.company_id = v_periodo.company_id
           AND a.ativo = true
           AND a.vigencia_inicio <= v_fim
           AND (a.vigencia_fim IS NULL OR a.vigencia_fim >= v_fim)
           AND (
             (a.escopo = 'cargo' AND a.cargo_id = r.cargo_id)
             OR (a.escopo = 'unidade' AND a.unidade_id = r.unidade_id)
             OR (a.escopo = 'sindicato' AND a.sindicato_id = r.sindicato_id)
             OR a.escopo = 'empresa'
           )
         ORDER BY CASE a.escopo WHEN 'cargo' THEN 4 WHEN 'unidade' THEN 3 WHEN 'sindicato' THEN 2 ELSE 1 END DESC,
                  a.vigencia_inicio DESC
         LIMIT 1;

        IF v_regra.id IS NOT NULL AND v_regra.percentual_por_ciclo > 0 THEN
          v_meses := (date_part('year', v_fim) - date_part('year', r.data_admissao)) * 12
                     + (date_part('month', v_fim) - date_part('month', r.data_admissao))
                     - CASE WHEN date_part('day', v_fim) < date_part('day', r.data_admissao) THEN 1 ELSE 0 END;
          v_meses := GREATEST(v_meses, 0);
          v_ciclos := floor(v_meses / v_regra.ciclo_meses);
          IF v_regra.max_ciclos IS NOT NULL AND v_regra.max_ciclos > 0 THEN
            v_ciclos := LEAST(v_ciclos, v_regra.max_ciclos);
          END IF;
          IF NOT v_regra.acumula THEN v_ciclos := LEAST(v_ciclos, 1); END IF;
          v_perc := v_ciclos * v_regra.percentual_por_ciclo;
          v_adic := round(v_base * v_perc / 100.0, 2);
          IF v_adic > 0 THEN
            v_extras := v_extras || jsonb_build_array(jsonb_build_object(
              'descricao', v_regra.nome || ' (' || v_perc || '%)',
              'natureza', 'provento', 'valor', v_adic, 'tributavel', true));
          END IF;
        END IF;
      END IF;

      -- Salário-família: verba não tributável, por dependente elegível
      IF v_sf_cota IS NOT NULL AND v_sf_teto IS NOT NULL AND v_sf_vig IS NOT NULL
         AND date_part('year', v_sf_vig) >= date_part('year', v_fim)
         AND v_base <= v_sf_teto THEN
        SELECT COUNT(*) INTO v_sf_qtd
          FROM public.dp_dependentes d
         WHERE d.colaborador_id = r.id
           AND d.conta_salario_familia = true
           AND d.cessado_em IS NULL
           AND d.parentesco IN ('filho','enteado','tutelado')
           AND (d.deficiencia = true
                OR (d.data_nascimento IS NOT NULL AND d.data_nascimento > (v_fim - interval '14 years')));
        IF COALESCE(v_sf_qtd, 0) > 0 THEN
          v_extras := v_extras || jsonb_build_array(jsonb_build_object(
            'descricao', 'Salário-família (' || v_sf_qtd || ' dependente(s))',
            'natureza', 'provento', 'valor', round(v_sf_qtd * v_sf_cota, 2), 'tributavel', false));
        END IF;
      END IF;
    END IF;

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, valor_liquido, descontos, status)
    VALUES
      (v_periodo.company_id, _periodo_id, r.id, v_periodo.tipo, v_valor, v_valor,
       jsonb_build_object(
         'faltas', 0,
         'dsr', 0,
         'dependentes', COALESCE(r.dependentes_irrf, 0),
         'extras', v_extras,
         'proventos', jsonb_build_object('normais', v_valor, 'extras50', 0, 'extras100', 0, 'noturno', 0),
         'horas', jsonb_build_object(
           'normais', COALESCE(v_horas, 0), 'extras50', 0, 'extras100', 0, 'noturnos', 0,
           'falta', 0, 'atraso', 0, 'diasFalta', 0, 'dsrPerdidos', 0)
       ),
       'rascunho');

    v_count := v_count + 1;

    -- Vale-transporte: apenas no contracheque mensal, com desconto legal de até 6%
    IF v_periodo.tipo = 'contracheque_mensal' AND r.vale_transporte AND r.vt_dia > 0 THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.dp_folha_lancamentos l
        WHERE l.periodo_id = _periodo_id AND l.colaborador_id = r.id AND l.tipo = 'vale_transporte'
      ) THEN
        SELECT COUNT(DISTINCT p.data) INTO v_dias
          FROM public.dp_pontos p
         WHERE p.colaborador_id = r.id AND p.data BETWEEN v_ini AND v_fim;
        v_vt_bruto := round(COALESCE(v_dias, 0) * r.vt_dia, 2);
        v_vt_desc := LEAST(round(v_base * 0.06, 2), v_vt_bruto);
        IF v_vt_bruto > 0 THEN
          INSERT INTO public.dp_folha_lancamentos
            (company_id, periodo_id, colaborador_id, tipo, valor_bruto, valor_liquido, descontos, status)
          VALUES
            (v_periodo.company_id, _periodo_id, r.id, 'vale_transporte', v_vt_bruto,
             GREATEST(v_vt_bruto - v_vt_desc, 0),
             jsonb_build_object(
               'faltas', 0, 'dsr', 0, 'dependentes', 0,
               'extras', jsonb_build_array(jsonb_build_object(
                 'descricao', 'Desconto legal de vale-transporte (6%)',
                 'natureza', 'desconto', 'valor', v_vt_desc, 'tributavel', false)),
               'proventos', jsonb_build_object('normais', v_vt_bruto, 'extras50', 0, 'extras100', 0, 'noturno', 0),
               'horas', jsonb_build_object(
                 'normais', 0, 'extras50', 0, 'extras100', 0, 'noturnos', 0,
                 'falta', 0, 'atraso', 0, 'diasFalta', 0, 'dsrPerdidos', 0)
             ),
             'rascunho');
          v_count := v_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.dp_dependentes_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.dp_dependentes_sync_irrf() FROM anon, authenticated;