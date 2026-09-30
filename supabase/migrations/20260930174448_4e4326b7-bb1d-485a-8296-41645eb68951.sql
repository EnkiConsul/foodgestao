CREATE OR REPLACE FUNCTION public.dp_regra_bloqueia_data(_company_id uuid, _unidade_id uuid, _data date)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_ano int := EXTRACT(YEAR FROM _data)::int;
  v_mes int := EXTRACT(MONTH FROM _data)::int;
  v_dia int := EXTRACT(DAY FROM _data)::int;
  v_dow int := EXTRACT(DOW FROM _data)::int;
  v_aplicacao text;
  v_ano_ref int;
  v_meses jsonb;
  v_dias jsonb;
  v_ordinal int;
  v_diasem int;
  v_pos_dia int;
  v_tipo_orig text;
  v_first_dow int;
  v_dia_alvo int;
  v_sab date;
  v_dom date;
  v_has_unidades boolean;
  v_override boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.dp_datas_bloqueadas
     WHERE company_id = _company_id
       AND data = _data
       AND (unidade_id IS NULL OR unidade_id = _unidade_id)
       AND (liberada = true OR liberada_por_solicitacao IS NOT NULL)
  ) INTO v_override;
  IF v_override THEN RETURN false; END IF;

  FOR r IN
    SELECT id, tipo, mes, dia, regra_json
      FROM public.dp_bloqueio_regras
     WHERE company_id = _company_id
       AND ativo = true
  LOOP
    SELECT EXISTS (SELECT 1 FROM public.dp_bloqueio_regra_unidades WHERE regra_id = r.id)
      INTO v_has_unidades;
    IF v_has_unidades THEN
      IF _unidade_id IS NULL THEN CONTINUE; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.dp_bloqueio_regra_unidades
         WHERE regra_id = r.id AND unidade_id = _unidade_id
      ) THEN CONTINUE; END IF;
    END IF;

    v_aplicacao := COALESCE(r.regra_json->>'aplicacao', 'anual');
    v_ano_ref := NULLIF(r.regra_json->>'ano_referencia', '')::int;
    IF v_aplicacao = 'unica' AND v_ano_ref IS NOT NULL AND v_ano_ref <> v_ano THEN
      CONTINUE;
    END IF;

    v_meses := COALESCE(r.regra_json->'meses', '[]'::jsonb);
    IF jsonb_array_length(v_meses) > 0 THEN
      IF NOT (v_meses @> to_jsonb(v_mes)) THEN CONTINUE; END IF;
    ELSIF r.mes IS NOT NULL AND r.mes <> v_mes THEN
      CONTINUE;
    END IF;

    v_tipo_orig := r.regra_json->>'tipo_original';

    IF r.tipo = 'fixa_anual' THEN
      v_dias := COALESCE(r.regra_json->'dias', '[]'::jsonb);
      IF jsonb_array_length(v_dias) > 0 THEN
        IF v_dias @> to_jsonb(v_dia) THEN RETURN true; END IF;
      ELSIF r.dia IS NOT NULL AND r.dia = v_dia THEN
        RETURN true;
      END IF;

    ELSIF r.tipo = 'dinamica' AND v_tipo_orig = 'pos_pagamento' THEN
      v_pos_dia := COALESCE(NULLIF(r.regra_json->>'pos_pagamento_dia', '')::int, 5);
      v_sab := make_date(v_ano, v_mes, v_pos_dia) + 1;
      WHILE EXTRACT(MONTH FROM v_sab)::int = v_mes AND EXTRACT(DOW FROM v_sab)::int <> 6 LOOP
        v_sab := v_sab + 1;
      END LOOP;
      IF EXTRACT(MONTH FROM v_sab)::int = v_mes THEN
        v_dom := v_sab + 1;
        IF _data = v_sab THEN RETURN true; END IF;
        IF EXTRACT(MONTH FROM v_dom)::int = v_mes AND _data = v_dom THEN RETURN true; END IF;
      END IF;

    ELSIF r.tipo = 'dinamica' THEN
      v_ordinal := COALESCE(NULLIF(r.regra_json->>'ordinal', '')::int, 1);
      v_diasem := COALESCE(NULLIF(r.regra_json->>'dia_semana', '')::int, 0);
      IF v_ordinal = 0 THEN
        IF v_dow = v_diasem THEN RETURN true; END IF;
        CONTINUE;
      END IF;
      v_first_dow := EXTRACT(DOW FROM make_date(v_ano, v_mes, 1))::int;
      v_dia_alvo := 1 + ((v_diasem - v_first_dow + 7) % 7) + (v_ordinal - 1) * 7;
      IF v_dia_alvo BETWEEN 1 AND 31
         AND EXTRACT(MONTH FROM make_date(v_ano, v_mes, v_dia_alvo))::int = v_mes
         AND v_dia_alvo = v_dia THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$function$;