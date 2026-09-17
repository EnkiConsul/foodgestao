-- Concorrência da conclusão da Pré-Admissão — PREPARO (commitado).
--
-- ⚠ Só em banco isolado/descartável: cria fixtures sintéticas COMMITADAS e a
-- tabela auxiliar public.zz_preadm_conc_fix. NUNCA rodar no banco do projeto.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.zz_preadm_conc_fix;
CREATE TABLE public.zz_preadm_conc_fix (
  admin_a uuid, company_a uuid, cargo_a uuid, unidade_a uuid,
  preadmissao_a uuid, item_a uuid
);

DO $$
DECLARE
  oa uuid := gen_random_uuid(); aa uuid := gen_random_uuid();
  compa uuid := gen_random_uuid(); cga uuid := gen_random_uuid(); una uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); ia uuid := gen_random_uuid(); it1 uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'preadm-conc-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (oa,'owner'),(aa,'admin')) AS u(id, tag);

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (compa, oa, 'PREADMISSAO CONCORRENCIA LTDA', true, 'empresarial', 'ativa');
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (compa, aa, 'admin');
  INSERT INTO public.dp_unidades (id, company_id, nome) VALUES (una, compa, 'UNIDADE CONC PREADM');
  INSERT INTO public.dp_cargos (id, company_id, nome) VALUES (cga, compa, 'CARGO CONC PREADM');

  INSERT INTO public.dp_preadmissoes
    (id, company_id, candidato_nome, whatsapp, cargo_previsto_id, unidade_prevista_id,
     status, cpf, data_nascimento, dados, admin_dados,
     ficha_oficial_conferida_em, ficha_oficial_conferida_por, created_by)
  VALUES (pa, compa, 'CANDIDATO CONCORRENCIA', '5562900000010', cga, una,
          'registro_recebido', '11144477735', DATE '1994-02-03',
          jsonb_build_object('nome', 'CANDIDATO CONCORRENCIA', 'cpf', '11144477735'),
          jsonb_build_object('data_admissao', '2026-03-02', 'regime_trabalho', 'clt',
                             'forma_pagamento', 'mensalista'),
          now(), oa, oa);

  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, requisito_codigo, file_path, file_name, mime_type, status)
  VALUES (pa, compa, 'ficha_oficial',
          compa || '/preadmissao/' || pa || '/ficha-oficial.pdf', 'ficha-oficial.pdf',
          'application/pdf', 'aprovado');

  INSERT INTO public.dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status,
                                           total_paginas, fichas_identificadas, criado_por)
  VALUES (ia, compa, compa || '/fichas/' || ia || '/source.pdf', 'ficha.pdf', 'ready', 1, 1, oa);

  INSERT INTO public.dp_ficha_importacao_itens
    (id, importacao_id, company_id, pagina_inicio, pagina_fim, nome_extraido, cpf_extraido, status)
  VALUES (it1, ia, compa, 1, 1, 'CANDIDATO CONCORRENCIA', '11144477735', 'pendente');

  INSERT INTO public.zz_preadm_conc_fix VALUES (aa, compa, cga, una, pa, it1);
  RAISE NOTICE 'PREP concorrência: 1 pré-admissão pronta para conclusão';
END $$;
