-- Pré-Admissão pelo Candidato — isolamento, permissão e promoção atômica.
--
-- ⚠ ATENÇÃO: cria FIXTURES SINTÉTICAS (usuários, empresas, pré-admissões) e
-- executa RPCs de escrita. Deve rodar EXCLUSIVAMENTE em banco isolado e
-- descartável (scripts/test-p04-isolated.mjs --suite=preadmissao-isolamento).
-- NUNCA rodar no banco do projeto.
--
-- Cada cenário distingue NEGAÇÃO REAL de ausência de linha ou de FK inválida:
-- antes de exigir a recusa, o mesmo registro é comprovado existente e visível
-- para quem tem permissão, e o SQLSTATE esperado é verificado nominalmente.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE pa_fix (
  owner_a uuid, admin_a uuid, member_a uuid, outsider uuid, owner_b uuid, admin_b uuid,
  company_a uuid, company_b uuid,
  cargo_a uuid, unidade_a uuid, cargo_b uuid, unidade_b uuid,
  pa_a uuid, pa_a2 uuid, pa_b uuid,
  pessoa_a uuid, pessoa_b uuid,
  doc_ficha uuid, doc_dep uuid, doc_recusado uuid,
  imp_a uuid, item_a uuid, item_a2 uuid,
  token_a text, token_b text
) ON COMMIT DROP;

DO $$
DECLARE
  oa uuid := gen_random_uuid(); aa uuid := gen_random_uuid(); ma uuid := gen_random_uuid();
  ou uuid := gen_random_uuid(); ob uuid := gen_random_uuid(); ab uuid := gen_random_uuid();
  compa uuid := gen_random_uuid(); compb uuid := gen_random_uuid();
  cga uuid := gen_random_uuid(); una uuid := gen_random_uuid();
  cgb uuid := gen_random_uuid(); unb uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); p3 uuid := gen_random_uuid();
  pe1 uuid := gen_random_uuid(); pe2 uuid := gen_random_uuid();
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); d3 uuid := gen_random_uuid();
  ia uuid := gen_random_uuid(); it1 uuid := gen_random_uuid(); it2 uuid := gen_random_uuid();
  ta text := 'token-sintetico-empresa-a'; tb text := 'token-sintetico-empresa-b';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'preadm-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (oa,'owner-a'),(aa,'admin-a'),(ma,'member-a'),(ou,'outsider'),
                 (ob,'owner-b'),(ab,'admin-b')) AS u(id, tag);

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (compa, oa, 'PREADMISSAO SINTETICA A LTDA', true, 'empresarial', 'ativa'),
         (compb, ob, 'PREADMISSAO SINTETICA B LTDA', true, 'empresarial', 'ativa');

  INSERT INTO public.company_members (company_id, user_id, role) VALUES
    (compa, aa, 'admin'), (compa, ma, 'member'), (compb, ab, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.dp_unidades (id, company_id, nome) VALUES
    (una, compa, 'UNIDADE PREADM A'), (unb, compb, 'UNIDADE PREADM B');
  INSERT INTO public.dp_cargos (id, company_id, nome) VALUES
    (cga, compa, 'ATENDENTE PREADM A'), (cgb, compb, 'ATENDENTE PREADM B');

  -- Pré-admissão A pronta para conclusão (ficha oficial recebida e conferida)
  INSERT INTO public.dp_preadmissoes
    (id, company_id, candidato_nome, whatsapp, cargo_previsto_id, unidade_prevista_id,
     trabalho_apos_22h, status, cpf, data_nascimento, dados, admin_dados,
     ficha_oficial_conferida_em, ficha_oficial_conferida_por, created_by)
  VALUES
    (p1, compa, 'CANDIDATO A SINTETICO', '5562900000001', cga, una, false,
     'registro_recebido', '11144477735', DATE '1995-04-10',
     jsonb_build_object('nome', 'CANDIDATO A SINTETICO', 'cpf', '11144477735'),
     jsonb_build_object('data_admissao', '2026-03-02', 'regime_trabalho', 'clt',
                        'forma_pagamento', 'mensalista'),
     now(), oa, oa),
    -- Pré-admissão A ainda em revisão (sem ficha oficial)
    (p2, compa, 'CANDIDATO A2 SINTETICO', '5562900000002', cga, una, false,
     'aguardando_revisao', '12345678909', DATE '1998-08-20',
     jsonb_build_object('nome', 'CANDIDATO A2 SINTETICO', 'cpf', '12345678909'),
     '{}'::jsonb, NULL, NULL, oa),
    -- Pré-admissão da empresa B
    (p3, compb, 'CANDIDATO B SINTETICO', '5562900000003', cgb, unb, false,
     'aguardando_preenchimento', '19131243055', DATE '1997-01-05',
     jsonb_build_object('nome', 'CANDIDATO B SINTETICO', 'cpf', '19131243055'),
     '{}'::jsonb, NULL, NULL, ob);

  INSERT INTO public.dp_preadmissao_convites
    (preadmissao_id, company_id, token_hash, expires_at, created_by)
  VALUES (p1, compa, encode(sha256(convert_to(ta, 'utf8')), 'hex'), now() + interval '7 days', oa),
         (p3, compb, encode(sha256(convert_to(tb, 'utf8')), 'hex'), now() + interval '7 days', ob);

  INSERT INTO public.dp_preadmissao_pessoas
    (id, preadmissao_id, company_id, nome, data_nascimento, parentesco, cpf,
     finalidade_dependente, finalidade_sesc)
  VALUES (pe1, p1, compa, 'FILHO A SINTETICO', CURRENT_DATE - interval '4 years', 'filho',
          '52998224725', true, true),
         (pe2, p3, compb, 'FILHO B SINTETICO', CURRENT_DATE - interval '9 years', 'filho',
          '15350946056', true, false);

  INSERT INTO public.dp_preadmissao_documentos
    (id, preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name,
     mime_type, file_size, status)
  VALUES
    (d1, p1, compa, NULL, 'ficha_oficial',
     compa || '/preadmissao/' || p1 || '/ficha-oficial.pdf', 'ficha-oficial.pdf',
     'application/pdf', 2048, 'aprovado'),
    (d2, p1, compa, pe1, 'carteira_vacinacao',
     compa || '/preadmissao/' || p1 || '/vacina.pdf', 'vacina.pdf',
     'application/pdf', 1024, 'enviado'),
    (d3, p1, compa, NULL, 'identidade',
     compa || '/preadmissao/' || p1 || '/identidade-recusada.pdf', 'identidade-recusada.pdf',
     'application/pdf', 900, 'recusado');

  INSERT INTO public.dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status,
                                           total_paginas, fichas_identificadas, criado_por)
  VALUES (ia, compa, compa || '/fichas/' || ia || '/source.pdf', 'ficha-oficial.pdf',
          'ready', 2, 2, oa);

  INSERT INTO public.dp_ficha_importacao_itens
    (id, importacao_id, company_id, pagina_inicio, pagina_fim, nome_extraido, cpf_extraido, status)
  VALUES (it1, ia, compa, 1, 1, 'CANDIDATO A SINTETICO', '11144477735', 'pendente'),
         (it2, ia, compa, 2, 2, 'OUTRO CPF', '87748248800', 'pendente');

  INSERT INTO pa_fix VALUES (oa, aa, ma, ou, ob, ab, compa, compb, cga, una, cgb, unb,
                             p1, p2, p3, pe1, pe2, d1, d2, d3, ia, it1, it2, ta, tb);
  RAISE NOTICE 'PREP fixtures: 2 empresas, 6 usuários, 3 pré-admissões sintéticas';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.p_as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.p_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.p_reset() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.p_dados(_nome text, _cpf text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'nome', _nome, 'cpf', _cpf, 'data_nascimento', '1995-04-10',
    'data_admissao', '2026-03-02', 'sexo', 'M', 'telefone', '62988887777',
    'estado_civil', 'solteiro', 'salario_base', 2100.00,
    'endereco', jsonb_build_object('logradouro', 'RUA PREADM', 'numero', '1', 'uf', 'GO'))
$$;

CREATE OR REPLACE FUNCTION pg_temp.p_jornada() RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('dias', jsonb_agg(d ORDER BY (d ->> 'dow')::int))
    FROM (
      SELECT jsonb_build_object('dow', g, 'trabalha', g <> 0,
                                'entrada', CASE WHEN g <> 0 THEN '08:00' END,
                                'saida', CASE WHEN g <> 0 THEN '17:00' END,
                                'intervalo_minutos', CASE WHEN g <> 0 THEN 60 END) AS d
        FROM generate_series(0, 6) g
    ) s
$$;

-- =====================================================================
-- P1: gestor A vê apenas a própria empresa; gestor B vê apenas a dele.
--     A visibilidade cruzada é comparada com a visibilidade legítima, para
--     que "0 linhas" nunca seja confundido com ausência de registro.
-- =====================================================================
DO $$
DECLARE f pa_fix; n_a int; n_b int; n_ab int; n_ba int;
BEGIN
  SELECT * INTO f FROM pa_fix;

  PERFORM pg_temp.p_as_user(f.admin_a);
  SELECT count(*) INTO n_a FROM public.dp_preadmissoes WHERE id = f.pa_a;
  SELECT count(*) INTO n_ab FROM public.dp_preadmissoes WHERE id = f.pa_b;

  PERFORM pg_temp.p_as_user(f.admin_b);
  SELECT count(*) INTO n_b FROM public.dp_preadmissoes WHERE id = f.pa_b;
  SELECT count(*) INTO n_ba FROM public.dp_preadmissoes WHERE id = f.pa_a;
  PERFORM pg_temp.p_reset();

  IF n_a <> 1 OR n_b <> 1 THEN
    RAISE EXCEPTION 'FALHA P1: gestor não lê a própria pré-admissão (A=%, B=%)', n_a, n_b;
  END IF;
  IF n_ab <> 0 OR n_ba <> 0 THEN
    RAISE EXCEPTION 'FALHA P1: leitura cruzada entre empresas (A→B=%, B→A=%)', n_ab, n_ba;
  END IF;
  RAISE NOTICE 'OK P1: gestor A e gestor B isolados (registros existem e são vistos só pelo dono)';
END $$;

-- =====================================================================
-- P2: usuário autenticado SEM permissão (membro comum e usuário sem vínculo)
--     não lê nem grava — mesmo com o registro comprovadamente existente.
-- =====================================================================
DO $$
DECLARE f pa_fix; n int; existe int; st text;
BEGIN
  SELECT * INTO f FROM pa_fix;
  SELECT count(*) INTO existe FROM public.dp_preadmissoes WHERE id = f.pa_a;
  IF existe <> 1 THEN RAISE EXCEPTION 'FALHA P2: fixture ausente (pré-condição)'; END IF;

  FOR st IN SELECT unnest(ARRAY['member', 'outsider']) LOOP
    PERFORM pg_temp.p_as_user(CASE WHEN st = 'member' THEN f.member_a ELSE f.outsider END);
    SELECT count(*) INTO n FROM public.dp_preadmissoes WHERE id = f.pa_a;
    IF n <> 0 THEN
      RAISE EXCEPTION 'FALHA P2: % leu a pré-admissão (% linhas)', st, n;
    END IF;
    SELECT count(*) INTO n FROM public.dp_preadmissao_pessoas WHERE preadmissao_id = f.pa_a;
    IF n <> 0 THEN RAISE EXCEPTION 'FALHA P2: % leu familiares', st; END IF;

    BEGIN
      INSERT INTO public.dp_preadmissoes (company_id, candidato_nome, whatsapp)
      VALUES (f.company_a, 'INTRUSO ' || upper(st), '5562900000009');
      RAISE EXCEPTION 'FALHA P2: % inseriu pré-admissão', st;
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
  PERFORM pg_temp.p_reset();
  RAISE NOTICE 'OK P2: autenticado sem permissão não lê nem grava (negação 42501 comprovada)';
END $$;

-- =====================================================================
-- P3: o cliente (dono/admin) é SOMENTE LEITURA: status, token, conferência e
--     exclusão são exclusivos das rotinas do servidor.
-- =====================================================================
DO $$
DECLARE f pa_fix; erro text;
BEGIN
  SELECT * INTO f FROM pa_fix;
  PERFORM pg_temp.p_as_user(f.owner_a);

  BEGIN
    UPDATE public.dp_preadmissoes SET status = 'registro_recebido' WHERE id = f.pa_a2;
    RAISE EXCEPTION 'FALHA P3a: dono alterou status pelo cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.dp_preadmissao_convites SET token_hash = 'forjado' WHERE preadmissao_id = f.pa_a;
    RAISE EXCEPTION 'FALHA P3b: dono alterou o token pelo cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.dp_preadmissoes SET ficha_oficial_conferida_em = now() WHERE id = f.pa_a2;
    RAISE EXCEPTION 'FALHA P3c: dono registrou conferência pelo cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.dp_preadmissao_pessoas WHERE id = f.pessoa_a;
    RAISE EXCEPTION 'FALHA P3d: dono apagou familiar pelo cliente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_temp.p_reset();
  -- o servidor continua enxergando os dados intactos
  IF NOT EXISTS (SELECT 1 FROM public.dp_preadmissao_pessoas WHERE id = f.pessoa_a)
     OR (SELECT status FROM public.dp_preadmissoes WHERE id = f.pa_a2) <> 'aguardando_revisao' THEN
    RAISE EXCEPTION 'FALHA P3: dados alterados apesar da negação';
  END IF;
  RAISE NOTICE 'OK P3: cliente somente leitura (status/token/conferência/exclusão negados)';
END $$;

-- =====================================================================
-- P4: exclusão física bloqueada até para o papel do servidor (remoção lógica).
-- =====================================================================
DO $$
DECLARE f pa_fix;
BEGIN
  SELECT * INTO f FROM pa_fix;
  BEGIN
    DELETE FROM public.dp_preadmissao_documentos WHERE id = f.doc_dep;
    RAISE EXCEPTION 'FALHA P4: documento apagado fisicamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.dp_preadmissoes WHERE id = f.pa_a2;
    RAISE EXCEPTION 'FALHA P4: pré-admissão apagada fisicamente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'OK P4: exclusão física bloqueada pelos gatilhos';
END $$;

-- =====================================================================
-- P5: visitante (anon) não lê nem grava nada da Pré-Admissão.
-- =====================================================================
DO $$
DECLARE f pa_fix; n int; t text;
BEGIN
  SELECT * INTO f FROM pa_fix;
  PERFORM pg_temp.p_as_anon();
  FOR t IN SELECT unnest(ARRAY['dp_preadmissoes','dp_preadmissao_convites','dp_preadmissao_pessoas',
                               'dp_preadmissao_documentos','dp_preadmissao_eventos']) LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
      IF n <> 0 THEN RAISE EXCEPTION 'FALHA P5: visitante leu % (% linhas)', t, n; END IF;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.dp_preadmissoes (company_id, candidato_nome, whatsapp)
    VALUES (f.company_a, 'VISITANTE', '5562900000000');
    RAISE EXCEPTION 'FALHA P5: visitante gravou pré-admissão';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.p_reset();
  RAISE NOTICE 'OK P5: visitante sem leitura e sem escrita';
END $$;

-- =====================================================================
-- P6: candidato A × candidato B — o token só abre a própria ficha e um
--     documento nunca aceita familiar de outra ficha/empresa.
--     (A resolução por token é a mesma consulta usada pelo endpoint público.)
-- =====================================================================
DO $$
DECLARE f pa_fix; v_pa uuid; v_comp uuid; n int;
BEGIN
  SELECT * INTO f FROM pa_fix;

  SELECT c.preadmissao_id, c.company_id INTO v_pa, v_comp
    FROM public.dp_preadmissao_convites c
   WHERE c.token_hash = encode(sha256(convert_to(f.token_a, 'utf8')), 'hex')
     AND c.revoked_at IS NULL AND c.expires_at > now();
  IF v_pa <> f.pa_a OR v_comp <> f.company_a THEN
    RAISE EXCEPTION 'FALHA P6a: token do candidato A não resolveu a própria ficha';
  END IF;

  SELECT count(*) INTO n FROM public.dp_preadmissao_convites c
   WHERE c.token_hash = encode(sha256(convert_to(f.token_a, 'utf8')), 'hex')
     AND c.preadmissao_id = f.pa_b;
  IF n <> 0 THEN RAISE EXCEPTION 'FALHA P6b: token do candidato A alcança a ficha B'; END IF;

  SELECT count(*) INTO n FROM public.dp_preadmissao_convites c
   WHERE c.token_hash = encode(sha256(convert_to('token-inexistente', 'utf8')), 'hex');
  IF n <> 0 THEN RAISE EXCEPTION 'FALHA P6c: token inexistente resolveu convite'; END IF;

  -- integridade composta: documento da ficha A com familiar da ficha B
  BEGIN
    INSERT INTO public.dp_preadmissao_documentos
      (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name)
    VALUES (f.pa_a, f.company_a, f.pessoa_b, 'carteira_vacinacao',
            'x/cross.pdf', 'cross.pdf');
    RAISE EXCEPTION 'FALHA P6d: documento aceitou familiar de outra ficha';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- e o familiar correto da própria ficha é aceito (prova que a recusa acima
  -- é de integridade cruzada, não de FK genericamente inválida)
  INSERT INTO public.dp_preadmissao_documentos
    (preadmissao_id, company_id, pessoa_id, requisito_codigo, file_path, file_name)
  VALUES (f.pa_a, f.company_a, f.pessoa_a, 'declaracao_escolar',
          f.company_a || '/preadmissao/' || f.pa_a || '/escolar.pdf', 'escolar.pdf');

  RAISE NOTICE 'OK P6: candidato A e candidato B isolados por token e por integridade composta';
END $$;

-- =====================================================================
-- P7: promoção — gestor B e membro sem permissão recebem NEGAÇÃO
--     (insufficient_privilege), não "não encontrado".
-- =====================================================================
DO $$
DECLARE f pa_fix; st text; got text;
BEGIN
  SELECT * INTO f FROM pa_fix;
  FOR st IN SELECT unnest(ARRAY['gestor_b', 'member_a', 'outsider']) LOOP
    PERFORM pg_temp.p_as_user(CASE st WHEN 'gestor_b' THEN f.admin_b
                                      WHEN 'member_a' THEN f.member_a ELSE f.outsider END);
    got := NULL;
    BEGIN
      PERFORM public.dp_preadmissao_efetivar_com_ficha(
        p_preadmissao_id => f.pa_a, p_item_id => f.item_a,
        p_dados => pg_temp.p_dados('CANDIDATO A SINTETICO', '11144477735'),
        p_jornada => pg_temp.p_jornada());
      RAISE EXCEPTION 'FALHA P7: % concluiu pré-admissão de outra empresa', st;
    EXCEPTION WHEN insufficient_privilege THEN got := 'negado';
    END;
    IF got IS NULL THEN RAISE EXCEPTION 'FALHA P7: % sem negação explícita', st; END IF;
  END LOOP;
  PERFORM pg_temp.p_reset();
  RAISE NOTICE 'OK P7: promoção negada a gestor de outra empresa, membro e usuário sem vínculo';
END $$;

-- =====================================================================
-- P8: sem ficha oficial conferida e com CPF divergente a promoção falha
--     com check_violation (regra de negócio), não com falha de permissão.
-- =====================================================================
DO $$
DECLARE f pa_fix;
BEGIN
  SELECT * INTO f FROM pa_fix;
  PERFORM pg_temp.p_as_user(f.admin_a);

  BEGIN
    PERFORM public.dp_preadmissao_efetivar_com_ficha(
      p_preadmissao_id => f.pa_a2, p_item_id => f.item_a2,
      p_dados => pg_temp.p_dados('CANDIDATO A2 SINTETICO', '12345678909'),
      p_jornada => pg_temp.p_jornada());
    RAISE EXCEPTION 'FALHA P8a: promoveu sem ficha oficial conferida';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.dp_preadmissao_efetivar_com_ficha(
      p_preadmissao_id => f.pa_a, p_item_id => f.item_a2,
      p_dados => pg_temp.p_dados('OUTRA PESSOA', '87748248800'),
      p_jornada => pg_temp.p_jornada());
    RAISE EXCEPTION 'FALHA P8b: promoveu com CPF divergente';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  PERFORM pg_temp.p_reset();
  IF (SELECT colaborador_id FROM public.dp_preadmissoes WHERE id = f.pa_a) IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA P8: vínculo criado apesar da recusa';
  END IF;
  RAISE NOTICE 'OK P8: ficha oficial e CPF idêntico exigidos (check_violation)';
END $$;

-- =====================================================================
-- P9: promoção legítima do gestor A — cadastro, dependente e documentos
--     com titular preservado; documento recusado NÃO é aproveitado.
-- =====================================================================
DO $$
DECLARE f pa_fix; r jsonb; v_colab uuid; n int;
BEGIN
  SELECT * INTO f FROM pa_fix;
  PERFORM pg_temp.p_as_user(f.admin_a);
  r := public.dp_preadmissao_efetivar_com_ficha(
        p_preadmissao_id => f.pa_a, p_item_id => f.item_a,
        p_dados => pg_temp.p_dados('CANDIDATO A SINTETICO', '111.444.777-35'),
        p_jornada => pg_temp.p_jornada());
  PERFORM pg_temp.p_reset();

  v_colab := (r ->> 'colaborador_id')::uuid;
  IF v_colab IS NULL OR (r ->> 'ja_aplicado')::boolean THEN
    RAISE EXCEPTION 'FALHA P9: retorno inesperado %', r;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_preadmissoes
                  WHERE id = f.pa_a AND status = 'concluido' AND colaborador_id = v_colab
                    AND vinculo_admissao_em = DATE '2026-03-02') THEN
    RAISE EXCEPTION 'FALHA P9: pré-admissão não concluída corretamente';
  END IF;

  SELECT count(*) INTO n FROM public.dp_dependentes WHERE colaborador_id = v_colab;
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA P9: % dependentes (esperado 1)', n; END IF;

  SELECT count(*) INTO n FROM public.dp_documentos WHERE colaborador_id = v_colab;
  IF n <> 3 THEN RAISE EXCEPTION 'FALHA P9: % documentos migrados (esperado 3)', n; END IF;
  IF EXISTS (SELECT 1 FROM public.dp_documentos
              WHERE colaborador_id = v_colab AND titulo = 'IDENTIDADE') THEN
    RAISE EXCEPTION 'FALHA P9: documento recusado foi aproveitado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_documentos
                  WHERE colaborador_id = v_colab AND titulo = 'CARTEIRA_VACINACAO'
                    AND descricao LIKE '%FILHO A SINTETICO%'
                    AND descricao LIKE '%DEPENDENTE E SESC%'
                    AND aprovacao_status = 'pendente') THEN
    RAISE EXCEPTION 'FALHA P9: documento de familiar sem titular/finalidade preservados';
  END IF;
  RAISE NOTICE 'OK P9: promoção atômica com dependente e documentos rastreáveis';
END $$;

-- =====================================================================
-- P10: repetir a conclusão é idempotente (sem duplicar cadastro).
-- =====================================================================
DO $$
DECLARE f pa_fix; r jsonb; n int;
BEGIN
  SELECT * INTO f FROM pa_fix;
  PERFORM pg_temp.p_as_user(f.admin_a);
  r := public.dp_preadmissao_efetivar_com_ficha(
        p_preadmissao_id => f.pa_a, p_item_id => f.item_a,
        p_dados => pg_temp.p_dados('CANDIDATO A SINTETICO', '11144477735'),
        p_jornada => pg_temp.p_jornada());
  PERFORM pg_temp.p_reset();

  IF NOT (r ->> 'ja_aplicado')::boolean THEN
    RAISE EXCEPTION 'FALHA P10: segunda chamada não foi idempotente (%)', r;
  END IF;
  SELECT count(*) INTO n FROM public.dp_colaboradores
   WHERE company_id = f.company_a AND cpf = '11144477735';
  IF n <> 1 THEN RAISE EXCEPTION 'FALHA P10: % cadastros para o mesmo CPF', n; END IF;
  RAISE NOTICE 'OK P10: conclusão repetida é idempotente';
END $$;

ROLLBACK;
