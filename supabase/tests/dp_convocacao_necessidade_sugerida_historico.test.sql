-- Sugestão de horário da convocação: histórico de convocações publicadas tem precedência
-- sobre a prática da equipe fixa; ocorrências canceladas não influenciam.
-- Executar dentro de BEGIN; ... ROLLBACK;
BEGIN;

DO $$
DECLARE
  v_company uuid;
  v_owner uuid;
  v_unidade uuid;
  v_cargo uuid;
  v_grupo uuid := gen_random_uuid();
  v_alvo date := (date_trunc('month', now())::date + interval '2 months')::date;
  v_res jsonb;
BEGIN
  SELECT c.id, c.owner_id INTO v_company, v_owner
    FROM public.companies c
    JOIN public.dp_unidades u ON u.company_id = c.id
    JOIN public.dp_cargos g ON g.company_id = c.id
   LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'SKIP: sem empresa com unidade e cargo cadastrados';
    RETURN;
  END IF;

  SELECT id INTO v_unidade FROM public.dp_unidades WHERE company_id = v_company LIMIT 1;
  SELECT id INTO v_cargo FROM public.dp_cargos WHERE company_id = v_company LIMIT 1;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  INSERT INTO public.dp_convocacao_grupos (id, company_id, unidade_id, competencia, modalidade, status)
  VALUES (v_grupo, v_company, v_unidade, to_char(v_alvo, 'YYYY-MM'), 'aberta', 'publicada');

  -- duas convocações publicadas no mesmo dia da semana, mesma janela
  INSERT INTO public.dp_convocacao_ocorrencias
    (company_id, grupo_id, unidade_id, cargo_id, data,
     necessidade_entrada, necessidade_saida, necessidade_termina_no_dia_seguinte,
     horario_modo, vagas, status)
  VALUES
    (v_company, v_grupo, v_unidade, v_cargo, v_alvo - 7, '16:30', '00:35', true, 'jornada_individual', 1, 'publicada'),
    (v_company, v_grupo, v_unidade, v_cargo, v_alvo - 14, '16:30', '00:35', true, 'jornada_individual', 1, 'publicada'),
    -- cancelada não deve influenciar
    (v_company, v_grupo, v_unidade, v_cargo, v_alvo - 21, '09:00', '18:00', false, 'jornada_individual', 1, 'cancelada');

  v_res := public.dp_convocacao_necessidade_sugerida(v_company, v_unidade, v_cargo, v_alvo);

  ASSERT v_res->>'fonte' = 'historico_convocacoes',
    format('esperado fonte historico_convocacoes, obtido %s', v_res->>'fonte');
  ASSERT (v_res->'sugerido'->>'entrada') LIKE '16:30%',
    format('esperada entrada 16:30, obtido %s', v_res->'sugerido'->>'entrada');
  ASSERT (v_res->'sugerido'->>'saida') LIKE '00:35%',
    format('esperada saida 00:35, obtido %s', v_res->'sugerido'->>'saida');
  ASSERT (v_res->'sugerido'->>'termina_no_dia_seguinte')::boolean IS TRUE,
    'esperado termina_no_dia_seguinte = true';
  ASSERT (v_res->>'ambiguo')::boolean IS FALSE, 'não deveria haver empate';
  ASSERT jsonb_array_length(v_res->'alternativas') = 1,
    'apenas a janela do histórico publicado deveria constar';

  RAISE NOTICE 'OK: histórico de convocações publicadas alimenta a sugestão';
END $$;

ROLLBACK;
