-- Concorrência da aplicação de ficha — PREPARO (commitado).
--
-- ⚠ Só em banco isolado/descartável: cria fixtures sintéticas COMMITADAS e a
-- tabela auxiliar public.zz_ficha_conc_fix. NUNCA rodar no banco do projeto.

\set ON_ERROR_STOP on

DROP TABLE IF EXISTS public.zz_ficha_conc_fix;
CREATE TABLE public.zz_ficha_conc_fix (
  admin_a uuid, company_a uuid, cargo_a uuid, unidade_a uuid,
  imp_a uuid, it1 uuid, it2 uuid, it3 uuid
);

DO $$
DECLARE
  oa uuid := gen_random_uuid(); aa uuid := gen_random_uuid();
  compa uuid := gen_random_uuid(); cga uuid := gen_random_uuid(); una uuid := gen_random_uuid();
  ia uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'conc-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (oa,'owner'),(aa,'admin')) AS u(id, tag);

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (compa, oa, 'FICHA CONCORRENCIA LTDA', true, 'empresarial', 'ativa');
  INSERT INTO public.company_members (company_id, user_id, role) VALUES (compa, aa, 'admin');
  INSERT INTO public.dp_unidades (id, company_id, nome) VALUES (una, compa, 'UNIDADE CONC');
  INSERT INTO public.dp_cargos (id, company_id, nome) VALUES (cga, compa, 'CARGO CONC');

  INSERT INTO public.dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status,
                                           total_paginas, fichas_identificadas, criado_por)
  VALUES (ia, compa, 'conc/source.pdf', 'conc.pdf', 'ready', 3, 3, oa);

  INSERT INTO public.dp_ficha_importacao_itens
    (id, importacao_id, company_id, pagina_inicio, pagina_fim, nome_extraido, cpf_extraido, status)
  VALUES (i1, ia, compa, 1, 1, 'CONC UM', '11144477735', 'pendente'),
         (i2, ia, compa, 2, 2, 'CONC DOIS', '12345678909', 'pendente'),
         (i3, ia, compa, 3, 3, 'CONC TRES', '19131243055', 'pendente');

  INSERT INTO public.zz_ficha_conc_fix VALUES (aa, compa, cga, una, ia, i1, i2, i3);
  RAISE NOTICE 'PREP concorrência: 1 lote com 3 fichas commitadas (3 casos)';
END $$;
