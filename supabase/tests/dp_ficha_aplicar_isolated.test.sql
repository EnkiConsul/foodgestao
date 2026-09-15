-- Aplicação ATÔMICA da ficha de registro — cenários funcionais.
--
-- ⚠ ATENÇÃO: cria FIXTURES SINTÉTICAS (usuários, empresas, fichas), executa a
-- RPC de escrita e instala um GATILHO TEMPORÁRIO de falha. Deve rodar
-- EXCLUSIVAMENTE em banco isolado/descartável (ver scripts/test-p04-isolated.mjs
-- com --suite=ficha-aplicar-atomica). NUNCA rodar no banco do projeto.
--
-- A RPC sob teste é a de produção, sem qualquer parâmetro/hook de falha: o erro
-- no meio da transação é provocado por gatilho temporário criado AQUI, no clone.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/dp_ficha_aplicar_isolated.test.sql

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE f_fix (
  owner_a uuid, admin_a uuid, colab_a uuid, outsider uuid, admin_b uuid, super_a uuid,
  company_a uuid, company_b uuid,
  cargo_a uuid, unidade_a uuid, setor_a uuid, turno_a uuid,
  cargo_b uuid, unidade_b uuid,
  imp_a uuid, imp_b uuid,
  it_novo uuid, it_novo2 uuid, it_novo3 uuid, it_existente uuid,
  it_ignorar uuid, it_cpf_dup uuid, it_b uuid,
  colab_existente uuid, colab_portal uuid
) ON COMMIT DROP;

DO $$
DECLARE
  oa uuid := gen_random_uuid(); aa uuid := gen_random_uuid(); ca uuid := gen_random_uuid();
  ou uuid := gen_random_uuid(); ab uuid := gen_random_uuid(); sa uuid := gen_random_uuid();
  compa uuid := gen_random_uuid(); compb uuid := gen_random_uuid();
  cga uuid := gen_random_uuid(); una uuid := gen_random_uuid(); sea uuid := gen_random_uuid();
  tua uuid := gen_random_uuid(); cgb uuid := gen_random_uuid(); unb uuid := gen_random_uuid();
  ia uuid := gen_random_uuid(); ib uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); i3 uuid := gen_random_uuid();
  i4 uuid := gen_random_uuid(); i5 uuid := gen_random_uuid(); i6 uuid := gen_random_uuid();
  i7 uuid := gen_random_uuid();
  ce uuid := gen_random_uuid(); cp uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'ficha-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (oa,'owner-a'),(aa,'admin-a'),(ca,'colab-a'),(ou,'outsider'),
                 (ab,'admin-b'),(sa,'super')) AS u(id, tag);

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (compa, oa, 'FICHA SINTETICA A LTDA', true, 'empresarial', 'ativa'),
         (compb, ab, 'FICHA SINTETICA B LTDA', true, 'empresarial', 'ativa');

  INSERT INTO public.company_members (company_id, user_id, role) VALUES
    (compa, aa, 'admin'), (compa, ca, 'member'), (compb, ab, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (sa, 'super_admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.dp_unidades (id, company_id, nome) VALUES
    (una, compa, 'UNIDADE FICHA A'), (unb, compb, 'UNIDADE FICHA B');
  INSERT INTO public.dp_setores (id, company_id, unidade_id, nome) VALUES
    (sea, compa, una, 'SETOR FICHA A');
  INSERT INTO public.dp_cargos (id, company_id, nome) VALUES
    (cga, compa, 'ATENDENTE FICHA'), (cgb, compb, 'ATENDENTE FICHA B');
  INSERT INTO public.dp_turnos (id, company_id, nome, entrada, saida) VALUES
    (tua, compa, 'TURNO FICHA A', '08:00', '17:00');

  -- cadastro já existente (para o caminho de atualização) com dados que NÃO
  -- podem ser apagados por campos ausentes na ficha
  INSERT INTO public.dp_colaboradores (id, company_id, nome, cpf, unidade_id, matricula, nome_mae, telefone)
  VALUES (ce, compa, 'MARIA EXISTENTE', '52998224725', una, 'MAT-ANTIGA', 'MAE ANTIGA', '62999990000');
  -- colaborador com acesso de portal (perfil sem poder administrativo)
  INSERT INTO public.dp_colaboradores (id, company_id, nome, unidade_id, user_id)
  VALUES (cp, compa, 'COLABORADOR PORTAL', una, ca);

  INSERT INTO public.dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status,
                                           total_paginas, fichas_identificadas, criado_por)
  VALUES (ia, compa, compa || '/fichas/' || ia || '/source.pdf', 'fichas.pdf', 'ready', 7, 7, oa),
         (ib, compb, compb || '/fichas/' || ib || '/source.pdf', 'fichas-b.pdf', 'ready', 1, 1, ab);

  INSERT INTO public.dp_ficha_importacao_itens
    (id, importacao_id, company_id, pagina_inicio, pagina_fim, nome_extraido, cpf_extraido,
     colaborador_existente_id, arquivo_path, status)
  VALUES
    (i1, ia, compa, 1, 1, 'JOAO NOVO', '11144477735', NULL, compa || '/fichas/' || ia || '/source.pdf', 'pendente'),
    (i2, ia, compa, 2, 2, 'ANA NOVA', '12345678909', NULL, NULL, 'pendente'),
    (i3, ia, compa, 3, 3, 'PEDRO NOVO', '19131243055', NULL, NULL, 'pendente'),
    (i4, ia, compa, 4, 4, 'MARIA EXISTENTE', '52998224725', ce, NULL, 'duplicado'),
    (i5, ia, compa, 5, 5, 'IGNORAR ESTA', '15350946056', NULL, NULL, 'pendente'),
    (i6, ia, compa, 6, 6, 'CPF REPETIDO', '11144477735', NULL, NULL, 'pendente'),
    (i7, ib, compb, 1, 1, 'FICHA DA EMPRESA B', '87748248800', NULL, NULL, 'pendente');

  INSERT INTO f_fix VALUES (oa, aa, ca, ou, ab, sa, compa, compb, cga, una, sea, tua,
                            cgb, unb, ia, ib, i1, i2, i3, i4, i5, i6, i7, ce, cp);
  RAISE NOTICE 'PREP fixtures: 2 empresas, 6 usuários, 2 lotes e 7 fichas sintéticas';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.f_as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.f_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.f_reset() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;

/** Dados revisados típicos de uma ficha (colunas do cadastro). */
CREATE OR REPLACE FUNCTION pg_temp.f_dados(_nome text, _cpf text) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'nome', _nome, 'cpf', _cpf, 'data_nascimento', '1990-05-10',
    'data_admissao', '2026-02-01', 'sexo', 'M', 'telefone', '62988887777',
    'whatsapp', '62988887777', 'email_contato', 'teste@example.test',
    'estado_civil', 'solteiro', 'salario_base', 2200.50, 'cargo', 'ATENDENTE FICHA',
    'rg_numero', '1234567', 'nome_mae', 'MAE DA FICHA', 'matricula', 'MAT-FICHA',
    'endereco', jsonb_build_object('logradouro', 'RUA UM', 'numero', '10', 'uf', 'GO')
  )
$$;

/** Jornada 6x1 com folga no domingo. */
CREATE OR REPLACE FUNCTION pg_temp.f_jornada() RETURNS jsonb
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
-- F1: criar cadastro — colaborador + configuração + dias + item + contadores
--     em UMA transação.
-- =====================================================================
DO $$
DECLARE
  f f_fix; r jsonb; v_colab uuid; v_cfg uuid; n int; imp public.dp_ficha_importacoes;
  it public.dp_ficha_importacao_itens;
BEGIN
  SELECT * INTO f FROM f_fix;
  PERFORM pg_temp.f_as_user(f.admin_a);

  r := public.dp_ficha_aplicar(
        p_item_id => f.it_novo,
        p_dados => pg_temp.f_dados('joao novo', '111.444.777-35'),
        p_dados_extraidos => jsonb_build_object('nome', 'joao novo', 'revisado', true),
        p_atualizar_existente => false,
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_setor_id => f.setor_a,
        p_turno_id => f.turno_a, p_regime => 'clt', p_forma_pagamento => 'mensalista',
        p_possui_folha_ponto => true, p_optante_adiantamento => false,
        p_jornada => pg_temp.f_jornada());

  v_colab := (r ->> 'colaborador_id')::uuid;
  IF v_colab IS NULL OR (r ->> 'status') <> 'criado' OR (r ->> 'ja_aplicado')::boolean THEN
    RAISE EXCEPTION 'FALHA F1: retorno inesperado %', r;
  END IF;

  PERFORM pg_temp.f_reset();
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaboradores
                  WHERE id = v_colab AND company_id = f.company_a AND cpf = '11144477735'
                    AND nome = 'JOAO NOVO' AND cargo_id = f.cargo_a AND unidade_id = f.unidade_a
                    AND setor_id = f.setor_a AND regime = 'clt'
                    AND forma_pagamento = 'mensalista' AND salario_base = 2200.50
                    AND origem_cadastro = 'ficha_importacao'
                    AND ficha_importacao_item_id = f.it_novo) THEN
    RAISE EXCEPTION 'FALHA F1: cadastro não gravado como esperado';
  END IF;

  SELECT id INTO v_cfg FROM public.dp_colaborador_config_trabalho
   WHERE colaborador_id = v_colab AND vigencia_fim IS NULL;
  IF v_cfg IS NULL THEN RAISE EXCEPTION 'FALHA F1: configuração vigente não criada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaborador_config_trabalho
                  WHERE id = v_cfg AND company_id = f.company_a AND unidade_id = f.unidade_a
                    AND turno_padrao_id = f.turno_a AND folga_variavel = false
                    AND folga_fixa_dow = 0 AND vigencia_inicio = DATE '2026-02-01') THEN
    RAISE EXCEPTION 'FALHA F1: configuração vigente com conteúdo inesperado';
  END IF;

  SELECT count(*) INTO n FROM public.dp_colaborador_config_dias WHERE config_id = v_cfg;
  IF n <> 7 THEN RAISE EXCEPTION 'FALHA F1: % dias gravados (esperado 7)', n; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaborador_config_dias
                  WHERE config_id = v_cfg AND dow = 0 AND trabalha = false
                    AND entrada IS NULL AND turno_id IS NULL) THEN
    RAISE EXCEPTION 'FALHA F1: domingo de folga não gravado corretamente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaborador_config_dias
                  WHERE config_id = v_cfg AND dow = 1 AND trabalha
                    AND entrada = TIME '08:00' AND saida = TIME '17:00'
                    AND intervalo_minutos = 60 AND turno_id = f.turno_a) THEN
    RAISE EXCEPTION 'FALHA F1: dia trabalhado não gravado corretamente';
  END IF;

  SELECT * INTO it FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo;
  IF it.status <> 'criado' OR it.colaborador_id <> v_colab
     OR (it.dados_extraidos ->> 'revisado') <> 'true' THEN
    RAISE EXCEPTION 'FALHA F1: item não atualizado (%)', it.status;
  END IF;

  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.criados <> 1 OR imp.atualizados <> 0 THEN
    RAISE EXCEPTION 'FALHA F1: contadores errados (criados=%, atualizados=%)', imp.criados, imp.atualizados;
  END IF;
  IF imp.status = 'concluida' THEN
    RAISE EXCEPTION 'FALHA F1: lote com fichas pendentes foi concluído';
  END IF;

  RAISE NOTICE 'OK F1: criação atômica gravou colaborador, configuração, 7 dias, item e contadores (9 casos)';
END $$;

-- =====================================================================
-- F2: replay do MESMO item — devolve o mesmo colaborador, sem regravar.
-- =====================================================================
DO $$
DECLARE
  f f_fix; r jsonb; v_colab uuid; v_cfg uuid; n int; imp public.dp_ficha_importacoes;
BEGIN
  SELECT * INTO f FROM f_fix;
  SELECT colaborador_id INTO v_colab FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo;
  SELECT id INTO v_cfg FROM public.dp_colaborador_config_trabalho
   WHERE colaborador_id = v_colab AND vigencia_fim IS NULL;

  PERFORM pg_temp.f_as_user(f.admin_a);
  r := public.dp_ficha_aplicar(
        p_item_id => f.it_novo,
        p_dados => pg_temp.f_dados('OUTRO NOME', '111.444.777-35'),
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
        p_forma_pagamento => 'mensalista', p_jornada => pg_temp.f_jornada());
  PERFORM pg_temp.f_reset();

  IF (r ->> 'colaborador_id')::uuid <> v_colab OR NOT (r ->> 'ja_aplicado')::boolean THEN
    RAISE EXCEPTION 'FALHA F2: replay não devolveu o mesmo cadastro (%)', r;
  END IF;
  IF (SELECT nome FROM public.dp_colaboradores WHERE id = v_colab) <> 'JOAO NOVO' THEN
    RAISE EXCEPTION 'FALHA F2: replay regravou o cadastro';
  END IF;
  SELECT count(*) INTO n FROM public.dp_colaborador_config_dias WHERE config_id = v_cfg;
  IF n <> 7 THEN RAISE EXCEPTION 'FALHA F2: dias duplicados (%)', n; END IF;
  IF (SELECT count(*) FROM public.dp_colaborador_config_trabalho
       WHERE colaborador_id = v_colab) <> 1 THEN
    RAISE EXCEPTION 'FALHA F2: jornada duplicada';
  END IF;
  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.criados <> 1 THEN RAISE EXCEPTION 'FALHA F2: contador duplicado (%)', imp.criados; END IF;

  RAISE NOTICE 'OK F2: replay do mesmo item devolveu o mesmo colaborador sem regravar nem duplicar (5 casos)';
END $$;

-- =====================================================================
-- F3: atualizar quem já existe — só os campos escolhidos; ausentes preservados.
-- =====================================================================
DO $$
DECLARE
  f f_fix; r jsonb; c public.dp_colaboradores; imp public.dp_ficha_importacoes;
BEGIN
  SELECT * INTO f FROM f_fix;
  PERFORM pg_temp.f_as_user(f.owner_a);
  r := public.dp_ficha_aplicar(
        p_item_id => f.it_existente,
        p_dados => pg_temp.f_dados('MARIA EXISTENTE', '529.982.247-25')
                   || jsonb_build_object('matricula', 'MAT-NOVA', 'nome_mae', 'MAE NOVA'),
        p_campos => ARRAY['matricula','rg_numero'],
        p_atualizar_existente => true,
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
        p_forma_pagamento => 'mensalista');
  PERFORM pg_temp.f_reset();

  IF (r ->> 'status') <> 'atualizado' OR (r ->> 'colaborador_id')::uuid <> f.colab_existente THEN
    RAISE EXCEPTION 'FALHA F3: retorno inesperado %', r;
  END IF;
  SELECT * INTO c FROM public.dp_colaboradores WHERE id = f.colab_existente;
  IF c.matricula IS DISTINCT FROM 'MAT-NOVA' THEN
    RAISE EXCEPTION 'FALHA F3: campo escolhido não atualizado (%)', c.matricula;
  END IF;
  IF c.rg_numero IS DISTINCT FROM '1234567' THEN
    RAISE EXCEPTION 'FALHA F3: segundo campo escolhido não atualizado';
  END IF;
  IF c.nome_mae IS DISTINCT FROM 'MAE ANTIGA' THEN
    RAISE EXCEPTION 'FALHA F3: campo NÃO escolhido foi sobrescrito (%)', c.nome_mae;
  END IF;
  IF c.telefone IS DISTINCT FROM '62999990000' THEN
    RAISE EXCEPTION 'FALHA F3: campo ausente da seleção foi apagado';
  END IF;
  IF c.data_nascimento IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA F3: campo fora da seleção foi gravado';
  END IF;
  IF c.cargo_id IS DISTINCT FROM f.cargo_a OR c.regime IS DISTINCT FROM 'clt'::dp_regime_trabalho
     OR c.ficha_importacao_item_id IS DISTINCT FROM f.it_existente THEN
    RAISE EXCEPTION 'FALHA F3: campos de conferência não gravados';
  END IF;
  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.atualizados <> 1 OR imp.criados <> 1 THEN
    RAISE EXCEPTION 'FALHA F3: contadores errados (%/%)', imp.criados, imp.atualizados;
  END IF;

  RAISE NOTICE 'OK F3: atualização gravou só os campos escolhidos e preservou os demais (8 casos)';
END $$;

-- =====================================================================
-- F4: payload com conta/perfil/permissões/empresa é RECUSADO.
-- =====================================================================
DO $$
DECLARE
  f f_fix; chave text; v_state text; ok int := 0;
BEGIN
  SELECT * INTO f FROM f_fix;
  FOREACH chave IN ARRAY ARRAY['user_id','perfil_acesso','dp_permissions','company_id','deleted_at','ativo','id'] LOOP
    PERFORM pg_temp.f_as_user(f.admin_a);
    v_state := NULL;
    BEGIN
      PERFORM public.dp_ficha_aplicar(
        p_item_id => f.it_novo2,
        p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09') || jsonb_build_object(chave, f.admin_a::text),
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
        p_forma_pagamento => 'mensalista');
    EXCEPTION WHEN OTHERS THEN
      v_state := SQLSTATE;
    END;
    PERFORM pg_temp.f_reset();
    IF v_state IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FALHA F4: chave % não foi recusada (sqlstate %)', chave, coalesce(v_state, 'nenhum');
    END IF;
    ok := ok + 1;
  END LOOP;

  IF (SELECT status FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo2) <> 'pendente' THEN
    RAISE EXCEPTION 'FALHA F4: item foi alterado por chamada recusada';
  END IF;

  RAISE NOTICE 'OK F4: campos de conta/perfil/permissões/empresa recusados (42501 FORBIDDEN, % casos)', ok + 1;
END $$;

-- =====================================================================
-- F5: referências (cargo/unidade/setor/turno) de OUTRA empresa → 42501.
-- =====================================================================
DO $$
DECLARE f f_fix; v_state text; ok int := 0;
BEGIN
  SELECT * INTO f FROM f_fix;

  PERFORM pg_temp.f_as_user(f.admin_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_novo2,
      p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09'),
      p_cargo_id => f.cargo_b, p_unidade_id => f.unidade_a, p_regime => 'clt',
      p_forma_pagamento => 'mensalista');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'FALHA F5: cargo de outra empresa aceito (%)', v_state; END IF;
  ok := ok + 1;

  v_state := NULL;
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_novo2,
      p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_b, p_regime => 'clt',
      p_forma_pagamento => 'mensalista');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS DISTINCT FROM '42501' THEN RAISE EXCEPTION 'FALHA F5: unidade de outra empresa aceita (%)', v_state; END IF;
  ok := ok + 1;
  PERFORM pg_temp.f_reset();

  IF (SELECT status FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo2) <> 'pendente' THEN
    RAISE EXCEPTION 'FALHA F5: item alterado por chamada recusada';
  END IF;

  RAISE NOTICE 'OK F5: referências de outra empresa recusadas (42501 FORBIDDEN, % casos)', ok + 1;
END $$;

-- =====================================================================
-- F6: visitante (anon), colaborador do portal, usuário sem vínculo e admin de
--     OUTRA empresa não conseguem aplicar a ficha.
-- =====================================================================
DO $$
DECLARE f f_fix; v_state text; v_msg text; ok int := 0; alvo uuid; papel text;
BEGIN
  SELECT * INTO f FROM f_fix;

  FOREACH papel IN ARRAY ARRAY['anon','colab','outsider','admin_b'] LOOP
    IF papel = 'anon' THEN PERFORM pg_temp.f_as_anon();
    ELSIF papel = 'colab' THEN PERFORM pg_temp.f_as_user(f.colab_a);
    ELSIF papel = 'outsider' THEN PERFORM pg_temp.f_as_user(f.outsider);
    ELSE PERFORM pg_temp.f_as_user(f.admin_b);
    END IF;

    v_state := NULL;
    BEGIN
      PERFORM public.dp_ficha_aplicar(p_item_id => f.it_novo2,
        p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09'),
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
        p_forma_pagamento => 'mensalista');
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; v_msg := SQLERRM; END;
    PERFORM pg_temp.f_reset();

    -- anon não tem nem EXECUTE (42501); os demais param na RLS do item (42501)
    IF v_state IS DISTINCT FROM '42501' THEN
      RAISE EXCEPTION 'FALHA F6: papel % não foi negado (sqlstate %, %)', papel, coalesce(v_state,'nenhum'), v_msg;
    END IF;
    ok := ok + 1;
  END LOOP;

  SELECT colaborador_id INTO alvo FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo2;
  IF alvo IS NOT NULL THEN RAISE EXCEPTION 'FALHA F6: item recebeu cadastro'; END IF;

  RAISE NOTICE 'OK F6: visitante, colaborador, sem vínculo e admin de outra empresa negados (42501 FORBIDDEN, % casos)', ok + 1;
END $$;

-- =====================================================================
-- F7: CPF duplicado falha SEM gravação parcial.
-- =====================================================================
DO $$
DECLARE f f_fix; v_state text; antes int; depois int; it text;
BEGIN
  SELECT * INTO f FROM f_fix;
  SELECT count(*) INTO antes FROM public.dp_colaboradores WHERE company_id = f.company_a;

  PERFORM pg_temp.f_as_user(f.admin_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_cpf_dup,
      p_dados => pg_temp.f_dados('CPF REPETIDO', '111.444.777-35'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
      p_forma_pagamento => 'mensalista', p_jornada => pg_temp.f_jornada());
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  PERFORM pg_temp.f_reset();

  IF v_state IS DISTINCT FROM '23505' THEN
    RAISE EXCEPTION 'FALHA F7: CPF duplicado não devolveu 23505 (%)', coalesce(v_state, 'nenhum');
  END IF;
  SELECT count(*) INTO depois FROM public.dp_colaboradores WHERE company_id = f.company_a;
  IF depois <> antes THEN RAISE EXCEPTION 'FALHA F7: cadastro parcial criado'; END IF;
  SELECT status INTO it FROM public.dp_ficha_importacao_itens WHERE id = f.it_cpf_dup;
  IF it <> 'pendente' THEN RAISE EXCEPTION 'FALHA F7: item alterado (%)', it; END IF;

  RAISE NOTICE 'OK F7: CPF duplicado recusado (23505) sem gravação parcial (3 casos)';
END $$;

-- =====================================================================
-- F8: erro no MEIO da transação (depois de gravar o colaborador e apagar os
--     dias) reverte TUDO. O erro vem de um GATILHO TEMPORÁRIO criado só aqui,
--     no clone — a RPC de produção não tem parâmetro/hook de falha.
-- =====================================================================
CREATE OR REPLACE FUNCTION pg_temp.f_falha_dias() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'falha sintética no meio da transação' USING ERRCODE = 'P0001';
END $$;

DO $$
DECLARE
  f f_fix; v_state text; antes int; depois int; it text;
  v_cfg uuid; n_antes int; n_depois int; mae_antes text; mat_antes text;
  item_upd uuid := gen_random_uuid();
BEGIN
  SELECT * INTO f FROM f_fix;
  SELECT count(*) INTO antes FROM public.dp_colaboradores WHERE company_id = f.company_a;
  SELECT nome_mae, matricula INTO mae_antes, mat_antes
    FROM public.dp_colaboradores WHERE id = f.colab_existente;

  -- jornada já existente do cadastro que será atualizado: a falha no meio não
  -- pode deixá-la sem os dias que a rotina apaga antes de regravar
  INSERT INTO public.dp_colaborador_config_trabalho
    (company_id, colaborador_id, unidade_id, turno_padrao_id, folga_variavel, folga_fixa_dow, vigencia_inicio)
  VALUES (f.company_a, f.colab_existente, f.unidade_a, f.turno_a, false, 0, DATE '2026-01-01')
  RETURNING id INTO v_cfg;
  INSERT INTO public.dp_colaborador_config_dias
    (company_id, config_id, dow, trabalha, entrada, saida, intervalo_minutos)
  VALUES (f.company_a, v_cfg, 1, true, '07:00', '16:00', 60),
         (f.company_a, v_cfg, 2, true, '07:00', '16:00', 60);
  SELECT count(*) INTO n_antes FROM public.dp_colaborador_config_dias WHERE config_id = v_cfg;

  -- item novo apontando para o MESMO cadastro, para exercitar a atualização
  INSERT INTO public.dp_ficha_importacao_itens
    (id, importacao_id, company_id, pagina_inicio, pagina_fim, nome_extraido, cpf_extraido,
     colaborador_existente_id, status)
  VALUES (item_upd, f.imp_a, f.company_a, 7, 7, 'MARIA EXISTENTE', '52998224725',
          f.colab_existente, 'duplicado');

  EXECUTE 'CREATE TRIGGER zz_f8_falha BEFORE INSERT ON public.dp_colaborador_config_dias '
          'FOR EACH ROW EXECUTE FUNCTION pg_temp.f_falha_dias()';

  -- caso a: criação nova + jornada → nada deve sobrar
  PERFORM pg_temp.f_as_user(f.admin_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_novo2,
      p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
      p_forma_pagamento => 'mensalista', p_jornada => pg_temp.f_jornada());
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  PERFORM pg_temp.f_reset();
  IF v_state IS DISTINCT FROM 'P0001' THEN
    RAISE EXCEPTION 'FALHA F8a: erro sintético não propagou (%)', coalesce(v_state,'nenhum');
  END IF;
  SELECT count(*) INTO depois FROM public.dp_colaboradores WHERE company_id = f.company_a;
  IF depois <> antes THEN RAISE EXCEPTION 'FALHA F8a: colaborador sobreviveu ao rollback'; END IF;
  SELECT status INTO it FROM public.dp_ficha_importacao_itens WHERE id = f.it_novo2;
  IF it <> 'pendente' THEN RAISE EXCEPTION 'FALHA F8a: item alterado (%)', it; END IF;

  -- caso b: atualização real interrompida DEPOIS de gravar o cadastro e apagar
  -- os dias da jornada → cadastro, dias e item voltam ao estado anterior
  v_state := NULL;
  PERFORM pg_temp.f_as_user(f.admin_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => item_upd,
      p_dados => pg_temp.f_dados('MARIA EXISTENTE', '529.982.247-25')
                 || jsonb_build_object('nome_mae', 'MAE QUE NAO DEVE GRAVAR'),
      p_campos => ARRAY['nome_mae','matricula'], p_atualizar_existente => true,
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
      p_forma_pagamento => 'mensalista', p_jornada => pg_temp.f_jornada());
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  PERFORM pg_temp.f_reset();
  IF v_state IS DISTINCT FROM 'P0001' THEN
    RAISE EXCEPTION 'FALHA F8b: erro sintético não propagou (%)', coalesce(v_state,'nenhum');
  END IF;
  IF (SELECT nome_mae FROM public.dp_colaboradores WHERE id = f.colab_existente)
       IS DISTINCT FROM mae_antes
     OR (SELECT matricula FROM public.dp_colaboradores WHERE id = f.colab_existente)
       IS DISTINCT FROM mat_antes THEN
    RAISE EXCEPTION 'FALHA F8b: atualização do cadastro sobreviveu ao rollback';
  END IF;
  SELECT count(*) INTO n_depois FROM public.dp_colaborador_config_dias WHERE config_id = v_cfg;
  IF n_depois <> n_antes THEN
    RAISE EXCEPTION 'FALHA F8b: dias da jornada perdidos no rollback (% → %)', n_antes, n_depois;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dp_colaborador_config_dias
                  WHERE config_id = v_cfg AND dow = 1 AND entrada = TIME '07:00') THEN
    RAISE EXCEPTION 'FALHA F8b: dias antigos foram substituídos';
  END IF;
  SELECT status INTO it FROM public.dp_ficha_importacao_itens WHERE id = item_upd;
  IF it <> 'duplicado' THEN RAISE EXCEPTION 'FALHA F8b: item alterado (%)', it; END IF;

  -- fixture local do cenário: sai de cena para não alterar a contagem do lote
  DELETE FROM public.dp_ficha_importacao_itens WHERE id = item_upd;

  EXECUTE 'DROP TRIGGER zz_f8_falha ON public.dp_colaborador_config_dias';
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'zz_f8_falha') THEN
    RAISE EXCEPTION 'FALHA F8: gatilho temporário não foi removido';
  END IF;

  RAISE NOTICE 'OK F8: falha no meio da transação reverteu criação, atualização, dias e item; gatilho temporário removido (9 casos)';
END $$;

-- =====================================================================
-- F9: segundo item do MESMO lote aplica normalmente e os contadores somam.
-- =====================================================================
DO $$
DECLARE f f_fix; r jsonb; imp public.dp_ficha_importacoes;
BEGIN
  SELECT * INTO f FROM f_fix;
  PERFORM pg_temp.f_as_user(f.admin_a);
  r := public.dp_ficha_aplicar(p_item_id => f.it_novo2,
        p_dados => pg_temp.f_dados('ANA NOVA', '123.456.789-09'),
        p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
        p_forma_pagamento => 'mensalista', p_jornada => pg_temp.f_jornada());
  PERFORM pg_temp.f_reset();

  IF (r ->> 'status') <> 'criado' THEN RAISE EXCEPTION 'FALHA F9: %', r; END IF;
  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.criados <> 2 OR imp.atualizados <> 1 THEN
    RAISE EXCEPTION 'FALHA F9: contadores errados (%/%)', imp.criados, imp.atualizados;
  END IF;
  RAISE NOTICE 'OK F9: dois itens do mesmo lote aplicados com contadores somados em SQL (2 casos)';
END $$;

-- =====================================================================
-- F10: ignorar entra na mesma disciplina de contagem; item já aplicado não
--      pode ser ignorado; lote só é concluído quando não há mais pendências.
-- =====================================================================
DO $$
DECLARE f f_fix; imp public.dp_ficha_importacoes; v_state text; r jsonb;
BEGIN
  SELECT * INTO f FROM f_fix;

  PERFORM pg_temp.f_as_user(f.admin_a);
  r := public.dp_ficha_ignorar(f.it_ignorar);
  IF (r ->> 'status') <> 'ignorado' THEN RAISE EXCEPTION 'FALHA F10: %', r; END IF;
  -- idempotente
  r := public.dp_ficha_ignorar(f.it_ignorar);

  v_state := NULL;
  BEGIN
    PERFORM public.dp_ficha_ignorar(f.it_novo);
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS NULL THEN RAISE EXCEPTION 'FALHA F10: item já aplicado foi ignorado'; END IF;

  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.status = 'concluida' THEN
    RAISE EXCEPTION 'FALHA F10: lote concluído com pendências (it_novo3/it_cpf_dup)';
  END IF;

  -- fecha as pendências restantes: uma aplicada e a duplicada ignorada
  PERFORM public.dp_ficha_aplicar(p_item_id => f.it_novo3,
    p_dados => pg_temp.f_dados('PEDRO NOVO', '191.312.430-55'),
    p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
    p_forma_pagamento => 'mensalista');
  PERFORM public.dp_ficha_ignorar(f.it_cpf_dup);
  PERFORM pg_temp.f_reset();

  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = f.imp_a;
  IF imp.criados <> 3 OR imp.atualizados <> 1 THEN
    RAISE EXCEPTION 'FALHA F10: contadores finais errados (%/%)', imp.criados, imp.atualizados;
  END IF;
  IF imp.status <> 'concluida' OR imp.concluido_em IS NULL THEN
    RAISE EXCEPTION 'FALHA F10: lote sem pendências não foi concluído (%)', imp.status;
  END IF;

  RAISE NOTICE 'OK F10: ignorar contabilizado na mesma transação, item aplicado protegido e lote concluído só sem pendências (5 casos)';
END $$;

-- =====================================================================
-- F11: lote ainda em LEITURA (processing) nunca é marcado como concluído.
-- =====================================================================
DO $$
DECLARE f f_fix; imp2 uuid := gen_random_uuid(); item2 uuid := gen_random_uuid(); imp public.dp_ficha_importacoes;
BEGIN
  SELECT * INTO f FROM f_fix;
  INSERT INTO public.dp_ficha_importacoes (id, company_id, arquivo_path, arquivo_nome, status,
                                           total_paginas, fichas_identificadas, criado_por)
  VALUES (imp2, f.company_a, 'x/y.pdf', 'em-leitura.pdf', 'processing', 1, 1, f.owner_a);
  INSERT INTO public.dp_ficha_importacao_itens (id, importacao_id, company_id, pagina_inicio, pagina_fim, status)
  VALUES (item2, imp2, f.company_a, 1, 1, 'pendente');

  PERFORM pg_temp.f_as_user(f.admin_a);
  PERFORM public.dp_ficha_aplicar(p_item_id => item2,
    p_dados => pg_temp.f_dados('EM LEITURA', '877.482.488-00'),
    p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
    p_forma_pagamento => 'mensalista');
  PERFORM pg_temp.f_reset();

  SELECT * INTO imp FROM public.dp_ficha_importacoes WHERE id = imp2;
  IF imp.status <> 'processing' OR imp.concluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'FALHA F11: lote em leitura foi concluído (%)', imp.status;
  END IF;
  IF imp.criados <> 1 THEN RAISE EXCEPTION 'FALHA F11: contador não atualizou'; END IF;

  RAISE NOTICE 'OK F11: lote em leitura mantém o status e ainda conta os criados (2 casos)';
END $$;

-- =====================================================================
-- F12: super admin aplica ficha de qualquer empresa (política existente) e a
--      jornada inválida é recusada pelo servidor.
-- =====================================================================
DO $$
DECLARE f f_fix; r jsonb; v_state text;
BEGIN
  SELECT * INTO f FROM f_fix;
  -- super admin NÃO é membro da empresa: cargo/unidade dela ficam invisíveis
  -- para ele e a rotina recusa (fail closed), em vez de gravar às cegas
  PERFORM pg_temp.f_as_user(f.super_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_b,
      p_dados => pg_temp.f_dados('FICHA DA EMPRESA B', '877.482.488-00'),
      p_cargo_id => f.cargo_b, p_unidade_id => f.unidade_b, p_regime => 'clt',
      p_forma_pagamento => 'mensalista');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FALHA F12: referência invisível não recusada (%)', coalesce(v_state,'nenhum');
  END IF;

  -- quem administra a empresa B aplica a ficha da empresa B
  v_state := NULL;
  PERFORM pg_temp.f_as_user(f.admin_b);
  r := public.dp_ficha_aplicar(p_item_id => f.it_b,
        p_dados => pg_temp.f_dados('FICHA DA EMPRESA B', '877.482.488-00'),
        p_cargo_id => f.cargo_b, p_unidade_id => f.unidade_b, p_regime => 'clt',
        p_forma_pagamento => 'mensalista');
  IF (r ->> 'status') <> 'criado' THEN RAISE EXCEPTION 'FALHA F12: admin da B bloqueado (%)', r; END IF;
  IF (SELECT company_id FROM public.dp_colaboradores WHERE id = (r ->> 'colaborador_id')::uuid)
       <> f.company_b THEN
    RAISE EXCEPTION 'FALHA F12: cadastro criado na empresa errada';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_ficha_importacoes
              WHERE id = f.imp_a AND updated_at > now()) THEN
    RAISE EXCEPTION 'FALHA F12: lote da empresa A tocado pela ficha da empresa B';
  END IF;

  -- jornada com dia inválido
  PERFORM pg_temp.f_as_user(f.admin_a);
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_ignorar,
      p_dados => pg_temp.f_dados('X', '153.509.460-56'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'clt',
      p_forma_pagamento => 'mensalista',
      p_jornada => jsonb_build_object('dias', jsonb_build_array(jsonb_build_object('dow', 9, 'trabalha', true))));
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FALHA F12: jornada inválida aceita (%)', coalesce(v_state,'nenhum');
  END IF;

  -- CPF inválido
  v_state := NULL;
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_ignorar,
      p_dados => jsonb_build_object('nome', 'SEM CPF', 'cpf', '123'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a);
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS DISTINCT FROM '22023' THEN
    RAISE EXCEPTION 'FALHA F12: CPF inválido aceito (%)', coalesce(v_state,'nenhum');
  END IF;

  -- vínculo inexistente (enum) recusado pelo servidor
  v_state := NULL;
  BEGIN
    PERFORM public.dp_ficha_aplicar(p_item_id => f.it_ignorar,
      p_dados => pg_temp.f_dados('X', '153.509.460-56'),
      p_cargo_id => f.cargo_a, p_unidade_id => f.unidade_a, p_regime => 'inventado');
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE; END;
  IF v_state IS NULL THEN RAISE EXCEPTION 'FALHA F12: vínculo inválido aceito'; END IF;
  PERFORM pg_temp.f_reset();

  RAISE NOTICE 'OK F12: super admin autorizado e servidor recusou jornada/CPF/vínculo inválidos (5 casos)';
END $$;

-- =====================================================================
-- F13: permissões da RPC — nada para PUBLIC/anon, authenticated estrito.
-- =====================================================================
DO $$
DECLARE v_row record; n int := 0;
BEGIN
  FOR v_row IN
    SELECT p.proname,
           coalesce((SELECT string_agg(DISTINCT coalesce(a.grantee::regrole::text,'PUBLIC'), ',' ORDER BY coalesce(a.grantee::regrole::text,'PUBLIC'))
                       FROM aclexplode(p.proacl) a WHERE a.privilege_type = 'EXECUTE'), '-') AS quem,
           p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '-') AS cfg
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname IN ('dp_ficha_aplicar','dp_ficha_ignorar')
  LOOP
    IF v_row.quem LIKE '%anon%' OR v_row.quem LIKE '%PUBLIC%' THEN
      RAISE EXCEPTION 'FALHA F13: % aberta para % ', v_row.proname, v_row.quem;
    END IF;
    IF v_row.quem NOT LIKE '%authenticated%' THEN
      RAISE EXCEPTION 'FALHA F13: % sem EXECUTE para authenticated (%)', v_row.proname, v_row.quem;
    END IF;
    IF v_row.prosecdef THEN
      RAISE EXCEPTION 'FALHA F13: % é SECURITY DEFINER (esperado INVOKER)', v_row.proname;
    END IF;
    IF v_row.cfg <> 'search_path=public' THEN
      RAISE EXCEPTION 'FALHA F13: % sem search_path fixo (%)', v_row.proname, v_row.cfg;
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 2 THEN RAISE EXCEPTION 'FALHA F13: % rotinas encontradas (esperado 2)', n; END IF;
  RAISE NOTICE 'OK F13: as 2 rotinas são SECURITY INVOKER, com search_path fixo, sem anon/PUBLIC (8 casos)';
END $$;

ROLLBACK;
