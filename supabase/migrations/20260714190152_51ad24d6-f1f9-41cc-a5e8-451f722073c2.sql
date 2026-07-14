
CREATE OR REPLACE FUNCTION public.dp_folha_gerar_lancamentos(_periodo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_periodo public.dp_folha_periodos%ROWTYPE;
  v_count int := 0;
  v_valor numeric(14,2);
  v_adiant numeric(14,2);
  r record;
BEGIN
  SELECT * INTO v_periodo FROM public.dp_folha_periodos WHERE id = _periodo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Período não encontrado'; END IF;

  IF NOT (private.is_company_admin_or_owner(auth.uid(), v_periodo.company_id)
          OR EXISTS (SELECT 1 FROM public.companies c WHERE c.id = v_periodo.company_id AND c.user_id = auth.uid())
          OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR r IN
    SELECT dc.id, COALESCE(cg.salario_base, 0) AS salario_base
    FROM public.dp_colaboradores dc
    LEFT JOIN public.dp_cargos cg ON cg.id = dc.cargo_id
    WHERE dc.company_id = v_periodo.company_id
      AND dc.ativo = true
      AND NOT EXISTS (
        SELECT 1 FROM public.dp_folha_lancamentos l
        WHERE l.periodo_id = _periodo_id AND l.colaborador_id = dc.id
      )
  LOOP
    v_valor := r.salario_base;
    IF v_periodo.tipo = 'adiantamento' THEN
      v_valor := round(r.salario_base * 0.40, 2);
    ELSIF v_periodo.tipo = 'contracheque_mensal' THEN
      SELECT COALESCE(SUM(valor_liquido),0) INTO v_adiant
        FROM public.dp_folha_lancamentos la
        JOIN public.dp_folha_periodos pa ON pa.id = la.periodo_id
       WHERE la.colaborador_id = r.id
         AND pa.tipo = 'adiantamento'
         AND pa.competencia = v_periodo.competencia;
      v_valor := GREATEST(r.salario_base - v_adiant, 0);
    ELSIF v_periodo.tipo = 'contracheque_quinzenal' THEN
      v_valor := round(r.salario_base / 2.0, 2);
    ELSIF v_periodo.tipo = 'decimo_terceiro' THEN
      v_valor := round(r.salario_base / 2.0, 2);
    END IF;

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, valor_liquido, status)
    VALUES
      (v_periodo.company_id, _periodo_id, r.id, v_periodo.tipo, v_valor, v_valor, 'rascunho');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
