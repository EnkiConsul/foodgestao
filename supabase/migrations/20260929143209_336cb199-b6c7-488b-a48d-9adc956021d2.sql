CREATE OR REPLACE FUNCTION public.dp_cargo_salvar(p_dados jsonb, p_company_id uuid, p_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.dp_cargos; v_id uuid := p_id; v_nome text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'REM_EMPRESA_OBRIGATORIA'; END IF;
  IF p_dados ? 'salario_base' AND p_dados->>'salario_base' IS NOT NULL THEN
    PERFORM private.dp_remuneracao_admin(p_company_id);
  ELSIF NOT (public.has_role(auth.uid(), 'super_admin')
             OR public.tem_permissao(p_company_id, 'dp.cadastros',
                  CASE WHEN p_id IS NULL THEN 'inclusao' ELSE 'alteracao' END)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  PERFORM private.dp_json_campos_check(p_dados, ARRAY[
    'nome','cbo','salario_base','ativo','descricao','insalubre_periculoso','exige_cnh',
    'cnh_categoria_minima','exige_epi','insalubre','perigoso','insalubridade_percentual',
    'periculosidade_percentual','base_horas_mes','base_dias_mes']);

  IF v_id IS NULL THEN
    v_nome := upper(btrim(coalesce(p_dados->>'nome','')));
    IF v_nome = '' THEN RAISE EXCEPTION 'REM_CARGO_NOME_OBRIGATORIO'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('dp_cargo:' || p_company_id::text || ':' || v_nome, 0));
    SELECT id INTO v_id FROM public.dp_cargos
     WHERE company_id = p_company_id AND removido_em IS NULL AND upper(btrim(nome)) = v_nome
     LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.dp_cargos(company_id, nome) VALUES (p_company_id, v_nome) RETURNING * INTO v_row;
    END IF;
  END IF;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.dp_cargos WHERE id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_row.company_id <> p_company_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    IF v_row.removido_em IS NOT NULL THEN RAISE EXCEPTION 'REM_REGISTRO_EXCLUIDO'; END IF;
  END IF;

  v_row := jsonb_populate_record(v_row, p_dados);
  v_row.nome := upper(btrim(coalesce(v_row.nome,'')));
  IF v_row.nome = '' THEN RAISE EXCEPTION 'REM_CARGO_NOME_OBRIGATORIO'; END IF;
  PERFORM private.dp_faixa_check(v_row.salario_base, 0, 1000000, 'REM_SALARIO_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.insalubridade_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.periculosidade_percentual, 0, 100, 'REM_PERCENTUAL_INVALIDO');
  PERFORM private.dp_faixa_check(v_row.base_horas_mes, 0, 744, 'REM_BASE_HORAS_INVALIDA');
  PERFORM private.dp_faixa_check(v_row.base_dias_mes, 0, 31, 'REM_BASE_DIAS_INVALIDA');

  UPDATE public.dp_cargos SET
    nome = v_row.nome, cbo = v_row.cbo, salario_base = v_row.salario_base, ativo = v_row.ativo,
    descricao = v_row.descricao, insalubre_periculoso = v_row.insalubre_periculoso,
    exige_cnh = v_row.exige_cnh, cnh_categoria_minima = v_row.cnh_categoria_minima,
    exige_epi = v_row.exige_epi, insalubre = v_row.insalubre, perigoso = v_row.perigoso,
    insalubridade_percentual = v_row.insalubridade_percentual,
    periculosidade_percentual = v_row.periculosidade_percentual,
    base_horas_mes = v_row.base_horas_mes, base_dias_mes = v_row.base_dias_mes
   WHERE id = v_row.id;
  RETURN v_row.id;
END $$;