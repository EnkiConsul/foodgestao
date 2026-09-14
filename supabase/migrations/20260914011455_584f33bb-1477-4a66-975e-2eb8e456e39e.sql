CREATE OR REPLACE FUNCTION public.dp_convocacao_remuneracao_snapshot(_colaborador_id uuid, _carga_prevista_horas numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_c record;
  v_regime text;
  v_forma text;
  v_unidade text;
  v_valor numeric;
  v_qtd numeric;
  v_va_dia numeric := 0;
  v_va_desc numeric := 0;
  v_premio_dia numeric := 0;
  v_dias_base numeric;
BEGIN
  SELECT regime, forma_pagamento, valor_hora, valor_diaria, adicional_percentual,
         dependentes_irrf, vale_alimentacao, vale_alimentacao_valor,
         vale_alimentacao_periodicidade, vale_alimentacao_dias_base,
         vale_alimentacao_desconto_tipo, vale_alimentacao_desconto_valor,
         premio_assiduidade, premio_assiduidade_valor, premio_assiduidade_tipo,
         salario_base
    INTO v_c
    FROM public.dp_colaboradores
   WHERE id = _colaborador_id;

  IF v_c IS NULL THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'COLABORADOR_INEXISTENTE');
  END IF;

  IF NOT public.dp_regime_convocavel(v_c.regime) THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'REGIME_NAO_CONVOCAVEL');
  END IF;

  v_regime := v_c.regime::text;
  v_forma := NULLIF(v_c.forma_pagamento::text, '');

  IF v_regime = 'intermitente' THEN
    IF v_forma IS DISTINCT FROM 'horista' THEN
      RETURN jsonb_build_object('elegivel', false, 'motivo', 'INTERMITENTE_EXIGE_HORISTA');
    END IF;
    v_unidade := 'hora';
    v_valor := COALESCE(v_c.valor_hora, 0);
    v_qtd := COALESCE(_carga_prevista_horas, 0);
  ELSE
    IF v_forma = 'horista' THEN
      v_unidade := 'hora';
      v_valor := COALESCE(v_c.valor_hora, 0);
      v_qtd := COALESCE(_carga_prevista_horas, 0);
    ELSIF v_forma = 'diarista' THEN
      v_unidade := 'diaria';
      v_valor := COALESCE(v_c.valor_diaria, 0);
      v_qtd := 1;
    ELSE
      RETURN jsonb_build_object('elegivel', false, 'motivo', 'REMUNERACAO_MENSALISTA_NAO_ELEGIVEL');
    END IF;
  END IF;

  IF v_valor <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo',
      CASE WHEN v_unidade = 'diaria' THEN 'VALOR_DIARIA_AUSENTE' ELSE 'VALOR_HORA_AUSENTE' END);
  END IF;

  IF v_qtd <= 0 THEN
    RETURN jsonb_build_object('elegivel', false, 'motivo', 'QUANTIDADE_PREVISTA_INVALIDA');
  END IF;

  -- Vale-alimentação convertido para o dia: benefício diário usa o valor cheio;
  -- benefício mensal é rateado pelos dias base (22 quando não informado).
  IF COALESCE(v_c.vale_alimentacao, false) AND COALESCE(v_c.vale_alimentacao_valor, 0) > 0 THEN
    v_dias_base := GREATEST(COALESCE(NULLIF(v_c.vale_alimentacao_dias_base, 0), 22), 1);
    v_va_dia := CASE
      WHEN COALESCE(v_c.vale_alimentacao_periodicidade, 'mensal') = 'diario'
        THEN v_c.vale_alimentacao_valor
      ELSE v_c.vale_alimentacao_valor / v_dias_base
    END;
    v_va_desc := CASE COALESCE(v_c.vale_alimentacao_desconto_tipo, 'nenhum')
      WHEN 'percentual' THEN v_va_dia * LEAST(GREATEST(COALESCE(v_c.vale_alimentacao_desconto_valor, 0), 0), 100) / 100
      WHEN 'valor' THEN LEAST(COALESCE(v_c.vale_alimentacao_desconto_valor, 0) / v_dias_base, v_va_dia)
      ELSE 0
    END;
  END IF;

  -- Prêmio de assiduidade rateado por dia trabalhado (referência informativa).
  IF COALESCE(v_c.premio_assiduidade, false) AND COALESCE(v_c.premio_assiduidade_valor, 0) > 0 THEN
    v_premio_dia := CASE
      WHEN COALESCE(v_c.premio_assiduidade_tipo, 'valor') = 'percentual'
        THEN COALESCE(v_c.salario_base, 0) * LEAST(GREATEST(v_c.premio_assiduidade_valor, 0), 100) / 100 / 22
      ELSE v_c.premio_assiduidade_valor / 22
    END;
  END IF;

  RETURN jsonb_build_object(
    'elegivel', true,
    'forma_pagamento', v_forma,
    'unidade_remuneracao', v_unidade,
    'valor_unitario', round(v_valor, 2),
    'quantidade_prevista', round(v_qtd, 2),
    'valor_previsto', round(v_valor * v_qtd, 2),
    'adicional_percentual', COALESCE(v_c.adicional_percentual, 0),
    'dependentes_irrf', COALESCE(v_c.dependentes_irrf, 0),
    'vale_alimentacao_dia', round(v_va_dia, 2),
    'vale_alimentacao_desconto_dia', round(v_va_desc, 2),
    'premio_assiduidade_dia', round(v_premio_dia, 2),
    'adicional_noturno_percentual', 20,
    'fonte', 'cadastro_colaborador');
END;
$function$;