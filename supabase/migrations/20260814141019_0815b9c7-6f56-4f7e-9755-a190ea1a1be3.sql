DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'dp_forma_pagamento') THEN
    CREATE TYPE public.dp_forma_pagamento AS ENUM ('mensalista', 'horista', 'diarista');
  END IF;
END $$;

ALTER TABLE public.dp_colaboradores
  ADD COLUMN IF NOT EXISTS forma_pagamento public.dp_forma_pagamento NOT NULL DEFAULT 'mensalista',
  ADD COLUMN IF NOT EXISTS salario_base numeric(14,2),
  ADD COLUMN IF NOT EXISTS valor_hora numeric(14,4),
  ADD COLUMN IF NOT EXISTS dependentes_irrf smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_percentual numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vale_transporte boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vale_transporte_valor_dia numeric(10,2);

ALTER TABLE public.dp_colaboradores
  DROP CONSTRAINT IF EXISTS dp_colaboradores_remuneracao_valida;
ALTER TABLE public.dp_colaboradores
  ADD CONSTRAINT dp_colaboradores_remuneracao_valida CHECK (
    coalesce(salario_base, 0) >= 0
    AND coalesce(valor_hora, 0) >= 0
    AND dependentes_irrf >= 0
    AND adicional_percentual >= 0 AND adicional_percentual <= 100
    AND coalesce(vale_transporte_valor_dia, 0) >= 0
  );

-- Colaboradores ativos sem remuneração definida (bloqueio da folha)
CREATE OR REPLACE FUNCTION public.dp_folha_pendencias_remuneracao(_company_id uuid)
RETURNS TABLE (colaborador_id uuid, nome text, forma_pagamento public.dp_forma_pagamento, motivo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dc.id,
         dc.nome,
         dc.forma_pagamento,
         CASE WHEN dc.forma_pagamento = 'horista' THEN 'Valor da hora não informado'
              ELSE 'Salário base não informado (colaborador e cargo)' END
  FROM public.dp_colaboradores dc
  LEFT JOIN public.dp_cargos cg ON cg.id = dc.cargo_id
  WHERE dc.company_id = _company_id
    AND dc.ativo = true
    AND (
      private.is_company_admin_or_owner(auth.uid(), dc.company_id)
      OR public.is_super_admin(auth.uid())
    )
    AND (
      (dc.forma_pagamento = 'horista' AND coalesce(dc.valor_hora, 0) <= 0)
      OR (dc.forma_pagamento <> 'horista' AND coalesce(dc.salario_base, cg.salario_base, 0) <= 0)
    )
  ORDER BY dc.nome;
$$;

GRANT EXECUTE ON FUNCTION public.dp_folha_pendencias_remuneracao(uuid) TO authenticated;

-- Geração de lançamentos usando a remuneração do cadastro
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_lancamentos(_periodo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  FOR r IN
    SELECT dc.id,
           dc.forma_pagamento,
           COALESCE(dc.salario_base, cg.salario_base, 0) AS salario_base,
           COALESCE(dc.valor_hora, 0) AS valor_hora,
           dc.dependentes_irrf,
           dc.adicional_percentual,
           dc.vale_transporte,
           COALESCE(dc.vale_transporte_valor_dia, 0) AS vt_dia
    FROM public.dp_colaboradores dc
    LEFT JOIN public.dp_cargos cg ON cg.id = dc.cargo_id
    WHERE dc.company_id = v_periodo.company_id
      AND dc.ativo = true
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

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, valor_liquido, descontos, status)
    VALUES
      (v_periodo.company_id, _periodo_id, r.id, v_periodo.tipo, v_valor, v_valor,
       jsonb_build_object(
         'faltas', 0,
         'dsr', 0,
         'dependentes', COALESCE(r.dependentes_irrf, 0),
         'extras', '[]'::jsonb,
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
        v_vt_bruto := round(r.vt_dia * 22, 2);
        v_vt_desc := LEAST(v_vt_bruto, round(v_base * 0.06, 2));
        INSERT INTO public.dp_folha_lancamentos
          (company_id, periodo_id, colaborador_id, tipo, valor_bruto, descontos, valor_liquido, observacoes)
        VALUES (
          v_periodo.company_id, _periodo_id, r.id, 'vale_transporte', v_vt_bruto,
          CASE WHEN v_vt_desc > 0
            THEN jsonb_build_array(jsonb_build_object('descricao', 'Desconto vale-transporte (6%)', 'valor', v_vt_desc))
            ELSE '[]'::jsonb END,
          GREATEST(v_vt_bruto - v_vt_desc, 0),
          'Gerado automaticamente a partir do cadastro do colaborador'
        );
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;