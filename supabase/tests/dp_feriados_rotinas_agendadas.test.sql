-- Execute against a database with migrations 0230/0231 applied and at least one unit.
-- Everything runs inside one block and ends with the sentinel TESTE_OK, which rolls back all writes.
DO $$
DECLARE v_un uuid; v_comp uuid; n_base int; n_publico int;
BEGIN
  SELECT id, company_id INTO v_un, v_comp FROM public.dp_unidades ORDER BY created_at LIMIT 1;
  IF v_un IS NULL THEN RAISE EXCEPTION 'Sem unidade para testar'; END IF;
  INSERT INTO public.dp_unidade_feriados(company_id, unidade_id, nome, tipo, data, categoria, ativo)
  VALUES (v_comp, v_un, 'Feriado de teste', 'especifica', DATE '2031-03-03', 'municipal', true);

  -- Rotinas agendadas (sem sessão) enxergam o feriado pelo núcleo privado.
  SELECT count(*) INTO n_base FROM private.dp_feriados_resolver_base(v_un, DATE '2031-03-01', DATE '2031-03-31') WHERE nome = 'Feriado de teste';
  IF n_base <> 1 THEN RAISE EXCEPTION 'Núcleo privado deveria achar o feriado (achou %)', n_base; END IF;

  -- O resolvedor público continua fechado para quem não é da empresa.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  SELECT count(*) INTO n_publico FROM public.dp_feriados_resolver(v_un, DATE '2031-03-01', DATE '2031-03-31');
  IF n_publico <> 0 THEN RAISE EXCEPTION 'Resolvedor público não pode expor feriados a estranhos (%)', n_publico; END IF;

  RAISE EXCEPTION 'TESTE_OK';
END $$;
