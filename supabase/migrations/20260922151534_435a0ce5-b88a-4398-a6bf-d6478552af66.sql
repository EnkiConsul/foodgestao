CREATE OR REPLACE FUNCTION public.dp_cargo_piso_definir(p_dados jsonb, p_id uuid DEFAULT NULL::uuid, p_justificativa text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.dp_cargo_salarios; v_company uuid; v_cargo uuid; v_unidade uuid; v_sind uuid;
  v_inicio date; v_anterior jsonb; v_id uuid := p_id; v_aberta record; v_novo numeric;
BEGIN
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'cargo_id','unidade_id','salario_base','vigencia_inicio','vigencia_fim',
    'sindicato_patronal_id','observacao']);

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.dp_cargo_salarios WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
    v_company := v_row.company_id;
    v_cargo := coalesce((p_dados->>'cargo_id')::uuid, v_row.cargo_id);
  ELSE
    v_cargo := (p_dados->>'cargo_id')::uuid;
    IF v_cargo IS NULL THEN RAISE EXCEPTION 'REM_CARGO_INVALIDO'; END IF;
    SELECT company_id INTO v_company FROM public.dp_cargos
     WHERE id = v_cargo AND removido_em IS NULL;
    IF v_company IS NULL THEN RAISE EXCEPTION 'REM_CARGO_INVALIDO'; END IF;
  END IF;

  PERFORM private.dp_remuneracao_admin(v_company);
  v_unidade := CASE WHEN p_dados ? 'unidade_id' THEN (p_dados->>'unidade_id')::uuid ELSE v_row.unidade_id END;
  v_sind := CASE WHEN p_dados ? 'sindicato_patronal_id' THEN (p_dados->>'sindicato_patronal_id')::uuid ELSE v_row.sindicato_patronal_id END;
  PERFORM private.dp_remuneracao_escopo_check(v_company, v_unidade, v_cargo, v_sind);
  IF v_unidade IS NULL AND v_sind IS NULL THEN RAISE EXCEPTION 'REM_PISO_ESCOPO_OBRIGATORIO'; END IF;

  -- Valor conferido antes de qualquer gravação, para recusar com aviso claro.
  v_novo := coalesce((p_dados->>'salario_base')::numeric, v_row.salario_base);
  IF v_novo IS NULL OR v_novo <= 0 THEN RAISE EXCEPTION 'REM_SALARIO_INVALIDO'; END IF;
  PERFORM private.dp_faixa_check(v_novo, 0, 1000000, 'REM_SALARIO_INVALIDO');

  v_inicio := coalesce((p_dados->>'vigencia_inicio')::date, v_row.vigencia_inicio, CURRENT_DATE);
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'dp_piso:' || v_company::text || ':' || v_cargo::text || ':' ||
    coalesce(v_unidade::text, 'sind') || ':' || coalesce(v_sind::text, '-'), 0));

  IF v_id IS NULL THEN
    -- Encontra ou sucede o piso em aberto do mesmo escopo.
    SELECT id, vigencia_inicio, salario_base INTO v_aberta
      FROM public.dp_cargo_salarios
     WHERE company_id = v_company AND cargo_id = v_cargo AND removido_em IS NULL
       AND vigencia_fim IS NULL
       AND ((v_unidade IS NOT NULL AND unidade_id = v_unidade)
            OR (v_unidade IS NULL AND unidade_id IS NULL AND sindicato_patronal_id = v_sind))
     ORDER BY vigencia_inicio DESC LIMIT 1;

    IF v_aberta.id IS NOT NULL AND v_aberta.vigencia_inicio >= v_inicio THEN
      v_id := v_aberta.id;
      SELECT * INTO v_row FROM public.dp_cargo_salarios WHERE id = v_id FOR UPDATE;
    ELSIF v_aberta.id IS NOT NULL THEN
      IF v_novo < v_aberta.salario_base
         AND coalesce(btrim(p_justificativa),'') = '' THEN
        RAISE EXCEPTION 'REM_PISO_REDUCAO_SEM_JUSTIFICATIVA';
      END IF;
      UPDATE public.dp_cargo_salarios SET vigencia_fim = v_inicio - 1 WHERE id = v_aberta.id;
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.dp_cargo_salarios(company_id, cargo_id, unidade_id,
      sindicato_patronal_id, salario_base, vigencia_inicio)
    VALUES (v_company, v_cargo, v_unidade, v_sind, v_novo, v_inicio)
    RETURNING * INTO v_row;
  END IF;

  v_anterior := to_jsonb(v_row);
  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.vigencia_inicio := v_inicio;
  v_row.cargo_id := v_cargo;
  v_row.unidade_id := v_unidade;
  v_row.sindicato_patronal_id := v_sind;
  v_row.salario_base := v_novo;

  IF v_row.vigencia_fim IS NOT NULL AND v_row.vigencia_fim < v_row.vigencia_inicio THEN
    RAISE EXCEPTION 'REM_PISO_VIGENCIA_INVALIDA';
  END IF;
  IF p_id IS NOT NULL
     AND v_row.salario_base < (v_anterior->>'salario_base')::numeric
     AND coalesce(btrim(p_justificativa),'') = '' THEN
    RAISE EXCEPTION 'REM_PISO_REDUCAO_SEM_JUSTIFICATIVA';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dp_cargo_salarios s
     WHERE s.company_id = v_company AND s.cargo_id = v_cargo AND s.id <> v_row.id
       AND s.removido_em IS NULL
       AND ((v_unidade IS NOT NULL AND s.unidade_id = v_unidade)
            OR (v_unidade IS NULL AND s.unidade_id IS NULL AND s.sindicato_patronal_id = v_sind))
       AND daterange(s.vigencia_inicio, s.vigencia_fim, '[]')
           && daterange(v_row.vigencia_inicio, v_row.vigencia_fim, '[]')
  ) THEN RAISE EXCEPTION 'REM_PISO_VIGENCIA_SOBREPOSTA'; END IF;

  UPDATE public.dp_cargo_salarios SET
    cargo_id = v_row.cargo_id, unidade_id = v_row.unidade_id,
    sindicato_patronal_id = v_row.sindicato_patronal_id, salario_base = v_row.salario_base,
    vigencia_inicio = v_row.vigencia_inicio, vigencia_fim = v_row.vigencia_fim,
    observacao = v_row.observacao
   WHERE id = v_row.id;

  IF coalesce(btrim(p_justificativa),'') <> ''
     OR (v_anterior->>'salario_base')::numeric IS DISTINCT FROM v_row.salario_base THEN
    INSERT INTO public.dp_regras_historico(company_id, tabela, registro_id, usuario_id,
      justificativa, valor_antigo, valor_novo)
    VALUES (v_company, 'dp_cargo_salarios', v_row.id, auth.uid(),
      nullif(btrim(coalesce(p_justificativa,'')), ''), v_anterior, to_jsonb(v_row));
  END IF;
  RETURN v_row.id;
END $function$;

REVOKE ALL ON FUNCTION public.dp_cargo_piso_definir(jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dp_cargo_piso_definir(jsonb, uuid, text) TO authenticated, service_role;