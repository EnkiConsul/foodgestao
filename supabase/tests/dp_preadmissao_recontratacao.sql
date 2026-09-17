-- Teste de caminho feliz: RECONTRATAÇÃO na efetivação da pré-admissão.
-- Executa em transação com ROLLBACK: nenhum dado real é alterado.
BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();
  v_comp uuid;
  v_colab uuid;
  v_imp uuid;
  v_item uuid;
  v_pa uuid;
  v_res jsonb;
  v_res2 jsonb;
  v_it record;
  v_c record;
  v_pa_row record;
  v_hist int;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, aud, role)
  VALUES (v_user, 'recontrata.teste@example.test', 'x', now(), now(), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated');

  INSERT INTO public.companies (user_id, name)
  VALUES (v_user, 'EMPRESA TESTE RECONTRATACAO') RETURNING id INTO v_comp;
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_comp, v_user, 'owner')
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

  -- Ex-colaborador desligado com o mesmo CPF
  INSERT INTO public.dp_colaboradores (company_id, nome, cpf, data_admissao, data_desligamento,
                                       ativo, origem_cadastro)
  VALUES (v_comp, 'CANDIDATO RECONTRATADO', '52998224725', '2023-01-02', '2024-05-31', false, 'manual')
  RETURNING id INTO v_colab;

  -- Importação sintética válida + item pendente
  INSERT INTO public.dp_ficha_importacoes (company_id, arquivo_path, arquivo_nome, status)
  VALUES (v_comp, 'teste/ficha.pdf', 'ficha.pdf', 'processing') RETURNING id INTO v_imp;
  INSERT INTO public.dp_ficha_importacao_itens (importacao_id, company_id, pagina_inicio, pagina_fim,
                                                status, dados_extraidos)
  VALUES (v_imp, v_comp, 1, 1, 'pendente',
          jsonb_build_object('nome','CANDIDATO RECONTRATADO','cpf','529.982.247-25'))
  RETURNING id INTO v_item;

  -- Pré-admissão conferida
  INSERT INTO public.dp_preadmissoes (company_id, candidato_nome, whatsapp, cpf, data_nascimento,
                                      status, dados, admin_dados, ficha_oficial_conferida_em,
                                      ficha_oficial_conferida_por)
  VALUES (v_comp, 'CANDIDATO RECONTRATADO', '62999990000', '52998224725', '1995-04-10',
          'registro_recebido',
          jsonb_build_object('nome','CANDIDATO RECONTRATADO','cpf','52998224725',
                             'data_nascimento','1995-04-10','nome_mae','MAE TESTE'),
          jsonb_build_object('data_admissao','2026-09-20','salario','2500',
                             'regime_trabalho','clt','forma_pagamento','mensalista'),
          now(), v_user)
  RETURNING id INTO v_pa;

  INSERT INTO public.dp_preadmissao_documentos (preadmissao_id, company_id, requisito_codigo,
                                               file_path, file_name, status)
  VALUES (v_pa, v_comp, 'ficha_oficial', 'teste/ficha-oficial.pdf', 'ficha-oficial.pdf', 'aprovado');

  -- Caminho feliz
  v_res := public.dp_preadmissao_efetivar_com_ficha(
    v_pa, v_item,
    jsonb_build_object('nome','CANDIDATO RECONTRATADO','cpf','52998224725',
                       'data_nascimento','1995-04-10','nome_mae','MAE TESTE'),
    NULL, NULL, NULL, NULL, NULL, 'clt', 'mensalista', NULL, NULL);

  RAISE NOTICE 'R1 resultado: %', v_res;
  IF v_res->>'modo' <> 'recontratacao' THEN
    RAISE EXCEPTION 'FALHA: modo esperado recontratacao, obtido %', v_res->>'modo';
  END IF;
  IF (v_res->>'colaborador_id')::uuid <> v_colab THEN
    RAISE EXCEPTION 'FALHA: colaborador diferente do ex-colaborador';
  END IF;

  SELECT * INTO v_it FROM public.dp_ficha_importacao_itens WHERE id = v_item;
  IF v_it.colaborador_id <> v_colab OR v_it.status <> 'atualizado' THEN
    RAISE EXCEPTION 'FALHA: item nao vinculado (status=%, colab=%)', v_it.status, v_it.colaborador_id;
  END IF;

  SELECT * INTO v_c FROM public.dp_colaboradores WHERE id = v_colab;
  IF NOT v_c.ativo OR v_c.data_desligamento IS NOT NULL OR v_c.data_admissao <> DATE '2026-09-20' THEN
    RAISE EXCEPTION 'FALHA: recontratacao nao aplicada (ativo=%, deslig=%, adm=%)',
      v_c.ativo, v_c.data_desligamento, v_c.data_admissao;
  END IF;
  IF v_c.nome_mae IS DISTINCT FROM 'MAE TESTE' THEN
    RAISE EXCEPTION 'FALHA: dados pessoais conferidos nao preservados (nome_mae=%)', v_c.nome_mae;
  END IF;
  IF v_c.salario_base IS DISTINCT FROM 2500::numeric THEN
    RAISE EXCEPTION 'FALHA: dados administrativos nao aplicados (salario=%)', v_c.salario_base;
  END IF;

  SELECT count(*) INTO v_hist FROM public.dp_colaborador_historico_condicoes
   WHERE colaborador_id = v_colab AND vigencia_inicio = DATE '2026-09-20';
  IF v_hist <> 1 THEN
    RAISE EXCEPTION 'FALHA: historico de recontratacao ausente (%)', v_hist;
  END IF;

  SELECT * INTO v_pa_row FROM public.dp_preadmissoes WHERE id = v_pa;
  IF v_pa_row.status <> 'concluido' OR v_pa_row.colaborador_id <> v_colab
     OR v_pa_row.ficha_importacao_item_id <> v_item
     OR v_pa_row.vinculo_admissao_em <> DATE '2026-09-20' THEN
    RAISE EXCEPTION 'FALHA: pre-admissao nao concluida corretamente (%)', row_to_json(v_pa_row);
  END IF;

  -- Idempotência (prova de implementação, não teste simultâneo)
  v_res2 := public.dp_preadmissao_efetivar_com_ficha(
    v_pa, v_item,
    jsonb_build_object('nome','CANDIDATO RECONTRATADO','cpf','52998224725'),
    NULL, NULL, NULL, NULL, NULL, 'clt', 'mensalista', NULL, NULL);
  IF (v_res2->>'ja_aplicado')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA: segunda chamada nao foi idempotente (%)', v_res2;
  END IF;

  RAISE NOTICE 'OK: recontratacao completa e idempotente. docs=% deps=%',
    v_res->>'documentos', v_res->>'dependentes';
END $$;

ROLLBACK;
