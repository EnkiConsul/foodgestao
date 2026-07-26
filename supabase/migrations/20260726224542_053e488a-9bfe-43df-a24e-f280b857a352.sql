CREATE OR REPLACE FUNCTION public.dp_beneficios_gerar_lancamentos(_periodo_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_ref date;
  v_count integer := 0;
  r record;
BEGIN
  SELECT company_id, date_trunc('month', competencia)::date
    INTO v_company, v_ref
  FROM public.dp_folha_periodos WHERE id = _periodo_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Período de folha não encontrado';
  END IF;

  IF NOT private.is_company_admin_or_owner(auth.uid(), v_company) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  FOR r IN
    SELECT cb.colaborador_id, b.folha_tipo,
           sum(cb.valor) AS bruto,
           sum(cb.desconto_valor) AS desconto
    FROM public.dp_colaborador_beneficios cb
    JOIN public.dp_beneficios b ON b.id = cb.beneficio_id
    WHERE cb.company_id = v_company
      AND cb.ativo AND b.ativo
      AND b.folha_tipo IS NOT NULL
      AND cb.data_inicio <= (v_ref + interval '1 month - 1 day')::date
      AND (cb.data_fim IS NULL OR cb.data_fim >= v_ref)
    GROUP BY cb.colaborador_id, b.folha_tipo
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.dp_folha_lancamentos l
      WHERE l.periodo_id = _periodo_id
        AND l.colaborador_id = r.colaborador_id
        AND l.tipo = r.folha_tipo
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.dp_folha_lancamentos
      (company_id, periodo_id, colaborador_id, tipo, valor_bruto, descontos, valor_liquido, observacoes)
    VALUES (
      v_company, _periodo_id, r.colaborador_id, r.folha_tipo,
      r.bruto,
      CASE WHEN coalesce(r.desconto,0) > 0
        THEN jsonb_build_array(jsonb_build_object('descricao','Desconto benefício','valor', r.desconto))
        ELSE '[]'::jsonb END,
      r.bruto - coalesce(r.desconto,0),
      'Gerado automaticamente a partir dos benefícios'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;