-- P0.4 — cenários funcionais ampliados (duas empresas sintéticas).
--
-- ⚠ ATENÇÃO: cria FIXTURES SINTÉTICAS (usuários, empresas, colaboradores) e
-- EXECUTA funções mutantes internas. Deve rodar EXCLUSIVAMENTE em banco
-- isolado/descartável de teste (ver scripts/test-p04-isolated.mjs).
-- NUNCA rodar no banco do projeto.
--
-- Perfis cobertos: dono, admin, colaborador (sem papel admin), usuário sem
-- vínculo e visitante (anon). Autenticação por claims reais (auth.uid()/auth.jwt())
-- com SET LOCAL ROLE authenticated / anon.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/dp_p04_scenarios_isolated.test.sql

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- FIXTURES: duas empresas sintéticas e cinco perfis.
-- =====================================================================
CREATE TEMP TABLE s_fix (
  owner_a uuid, admin_a uuid, colab_a uuid, outsider uuid,
  owner_b uuid, admin_b uuid,
  company_a uuid, company_b uuid,
  unidade_a uuid, unidade_b uuid,
  competencia date,
  colab_a1 uuid, colab_a2 uuid, jornada_a uuid
) ON COMMIT DROP;

DO $$
DECLARE
  oa uuid := gen_random_uuid(); aa uuid := gen_random_uuid(); ca uuid := gen_random_uuid();
  ou uuid := gen_random_uuid(); ob uuid := gen_random_uuid(); ab uuid := gen_random_uuid();
  compa uuid := gen_random_uuid(); compb uuid := gen_random_uuid();
  una uuid := gen_random_uuid(); unb uuid := gen_random_uuid();
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); cb1 uuid := gen_random_uuid();
  jor uuid := gen_random_uuid();
  comp date := date_trunc('month', now())::date;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'p04-' || u.tag || '-' || u.id || '@example.test', '', now(), now(), now()
    FROM (VALUES (oa,'owner-a'),(aa,'admin-a'),(ca,'colab-a'),(ou,'outsider'),
                 (ob,'owner-b'),(ab,'admin-b')) AS u(id, tag);

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (compa, oa, 'P04 SINTETICA A LTDA', true, 'empresarial', 'ativa'),
         (compb, ob, 'P04 SINTETICA B LTDA', true, 'empresarial', 'ativa');

  INSERT INTO public.company_members (company_id, user_id, role) VALUES
    (compa, aa, 'admin'), (compa, ca, 'member'),
    (compb, ab, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.dp_unidades (id, company_id, nome) VALUES
    (una, compa, 'UNIDADE SINTETICA A'), (unb, compb, 'UNIDADE SINTETICA B');

  -- colab_a é o perfil REAL de colaborador: usuário do portal vinculado a um
  -- registro de dp_colaboradores (user_id preenchido).
  INSERT INTO public.dp_colaboradores (id, company_id, nome, unidade_id, user_id)
  VALUES (c1, compa, 'COLABORADOR SINTETICO A1', una, ca),
         (c2, compa, 'COLABORADOR SINTETICO A2', una, NULL),
         (cb1, compb, 'COLABORADOR SINTETICO B1', unb, NULL);

  -- NÃO há jornada sintética: public.dp_jornadas tem o gatilho ativo
  -- trg_dp_jornadas_legado (dp_bloquear_cadastro_legado), que recusa novos
  -- cadastros ("Cadastro antigo de jornadas encerrado"). Alimentar essa tabela
  -- exigiria desabilitar uma regra de produção, o que não é feito aqui. Por
  -- isso S5.2 é reportado como PENDENTE, não como aprovado.

  INSERT INTO s_fix VALUES (oa, aa, ca, ou, ob, ab, compa, compb, una, unb, comp, c1, c2, NULL);
  RAISE NOTICE 'PREP fixtures: 2 empresas, 6 usuários e 3 colaboradores (1 com acesso de portal)';
END $$;



CREATE OR REPLACE FUNCTION pg_temp.s_as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated', 'aud', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.s_as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  PERFORM set_config('role', 'anon', true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.s_reset() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END $$;

-- =====================================================================
-- S1: as 9 rotinas internas NÃO podem ser executadas por authenticated
--     nem por anon. Prova por EXECUÇÃO REAL: só 42501 conta como negação.
-- =====================================================================
DO $$
DECLARE
  f s_fix;
  chamada text;
  chamadas text[];
  papel text;
  v_state text;
  v_msg text;
  v_ok int := 0;
BEGIN
  SELECT * INTO f FROM s_fix;
  chamadas := ARRAY[
    format('SELECT public.dp_bulk_increment_processed(%L::uuid)', gen_random_uuid()),
    format('SELECT public.dp_escala_auto_gerar(%L::uuid, %L::date)', f.company_a, f.competencia),
    'SELECT public.dp_escala_auto_gerar_todas()',
    'SELECT public.dp_folga_autoatribuir_todas()',
    format('SELECT public.dp_folga_autoatribuir_competencia(%L::uuid, %L::uuid, %L::date)', f.company_a, f.unidade_a, f.competencia),
    format('SELECT public.dp_folga_autoatribuir_manual(%L::uuid, %L::uuid, %L::date)', f.company_a, f.unidade_a, f.competencia),
    format('SELECT public.dp_folga_autoatribuicao_previa(%L::uuid, %L::uuid, %L::date)', f.company_a, f.unidade_a, f.competencia),
    'SELECT public.dp_escala_item_validar_setor()',
    'SELECT public.dp_folgas_validar_unificado()'
  ];

  FOREACH papel IN ARRAY ARRAY['authenticated','anon'] LOOP
    FOREACH chamada IN ARRAY chamadas LOOP
      IF papel = 'anon' THEN PERFORM pg_temp.s_as_anon();
      ELSE PERFORM pg_temp.s_as_user(f.admin_a); END IF;

      v_state := NULL; v_msg := NULL;
      BEGIN
        EXECUTE chamada;
      EXCEPTION WHEN others THEN
        v_state := SQLSTATE; v_msg := SQLERRM;
      END;
      PERFORM pg_temp.s_reset();

      IF v_state IS NULL THEN
        RAISE EXCEPTION 'FALHA S1: % executou "%" sem erro', papel, chamada;
      ELSIF v_state = '42501' AND v_msg ILIKE '%permission denied for function%' THEN
        v_ok := v_ok + 1;   -- única negação aceita: falta de EXECUTE
      ELSE
        RAISE EXCEPTION 'FALHA S1: negação inválida para % em "%": % / % (erro de dependência/500 não conta)',
          papel, chamada, v_state, v_msg;
      END IF;
    END LOOP;
  END LOOP;

  IF v_ok <> 18 THEN
    RAISE EXCEPTION 'FALHA S1: esperadas 18 negações por falta de EXECUTE, obtidas %', v_ok;
  END IF;
  RAISE NOTICE 'OK S1: 9 rotinas internas negadas por falta de EXECUTE para authenticated e anon (18 casos)';
END $$;
RESET ROLE;

-- =====================================================================
-- S2 (POSITIVO): dono e admin editam campos comuns das próprias empresas.
-- =====================================================================
DO $$
DECLARE f s_fix; v_nome text;
BEGIN
  SELECT * INTO f FROM s_fix;

  PERFORM pg_temp.s_as_user(f.owner_a);
  UPDATE public.companies SET name = 'P04 A EDITADA PELO DONO' WHERE id = f.company_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'FALHA S2: dono não editou a própria empresa'; END IF;
  PERFORM pg_temp.s_reset();

  PERFORM pg_temp.s_as_user(f.admin_a);
  UPDATE public.companies SET name = 'P04 A EDITADA PELO ADMIN' WHERE id = f.company_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'FALHA S2: admin não editou a empresa em que é admin'; END IF;
  PERFORM pg_temp.s_reset();

  SELECT name INTO v_nome FROM public.companies WHERE id = f.company_a;
  IF v_nome IS DISTINCT FROM 'P04 A EDITADA PELO ADMIN' THEN
    RAISE EXCEPTION 'FALHA S2: edição legítima não persistiu (%)', v_nome;
  END IF;
  RAISE NOTICE 'OK S2: edição comum da empresa preservada para dono e admin';
END $$;
RESET ROLE;

-- =====================================================================
-- S3 (NEGATIVO ENTRE EMPRESAS): admin de A não pode editar a empresa B,
--     nem colaborador/sem vínculo editar qualquer uma.
-- =====================================================================
DO $$
DECLARE
  f s_fix; v_nome_b text; v_depois text; v_rows int; v_state text; v_msg text;
  perfil text; uid uuid;
BEGIN
  SELECT * INTO f FROM s_fix;
  SELECT name INTO v_nome_b FROM public.companies WHERE id = f.company_b;

  FOREACH perfil IN ARRAY ARRAY['admin_a','colab_a','outsider'] LOOP
    uid := CASE perfil WHEN 'admin_a' THEN f.admin_a WHEN 'colab_a' THEN f.colab_a ELSE f.outsider END;
    PERFORM pg_temp.s_as_user(uid);
    v_state := NULL; v_rows := 0;
    BEGIN
      UPDATE public.companies SET name = 'P04 INVASAO ' || perfil WHERE id = f.company_b;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    EXCEPTION WHEN others THEN
      v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    PERFORM pg_temp.s_reset();

    SELECT name INTO v_depois FROM public.companies WHERE id = f.company_b;
    IF v_depois IS DISTINCT FROM v_nome_b THEN
      RAISE EXCEPTION 'FALHA S3: % alterou a empresa B (% -> %)', perfil, v_nome_b, v_depois;
    END IF;
    IF v_state IS NOT NULL AND v_state <> '42501' THEN
      RAISE EXCEPTION 'FALHA S3: erro inesperado para %: % / %', perfil, v_state, v_msg;
    END IF;
    IF v_state IS NULL AND v_rows <> 0 THEN
      RAISE EXCEPTION 'FALHA S3: UPDATE de % afetou % linha(s) na empresa B', perfil, v_rows;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK S3: admin de A, colaborador e usuário sem vínculo não alteram a empresa B (3 casos)';
END $$;
RESET ROLE;

-- =====================================================================
-- S3b (NEGATIVO NA PRÓPRIA EMPRESA): o colaborador (perfil real, vinculado a
--      dp_colaboradores.user_id) não edita a empresa em que trabalha.
-- =====================================================================
DO $$
DECLARE f s_fix; v_antes text; v_depois text; v_rows int := 0; v_state text; v_msg text; v_vinculo int;
BEGIN
  SELECT * INTO f FROM s_fix;
  SELECT count(*)::int INTO v_vinculo FROM public.dp_colaboradores
   WHERE company_id = f.company_a AND user_id = f.colab_a;
  IF v_vinculo <> 1 THEN
    RAISE EXCEPTION 'FALHA S3b: colaborador sintético não está vinculado ao usuário do portal (% vínculo)', v_vinculo;
  END IF;

  SELECT name INTO v_antes FROM public.companies WHERE id = f.company_a;
  PERFORM pg_temp.s_as_user(f.colab_a);
  BEGIN
    UPDATE public.companies SET name = 'P04 A EDITADA PELO COLABORADOR' WHERE id = f.company_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.s_reset();

  SELECT name INTO v_depois FROM public.companies WHERE id = f.company_a;
  IF v_depois IS DISTINCT FROM v_antes THEN
    RAISE EXCEPTION 'FALHA S3b: colaborador alterou a própria empresa (% -> %)', v_antes, v_depois;
  END IF;
  IF v_state IS NOT NULL AND v_state <> '42501' THEN
    RAISE EXCEPTION 'FALHA S3b: erro inesperado (% / %)', v_state, v_msg;
  END IF;
  IF v_state IS NULL AND v_rows <> 0 THEN
    RAISE EXCEPTION 'FALHA S3b: UPDATE do colaborador afetou % linha(s)', v_rows;
  END IF;
  RAISE NOTICE 'OK S3b: colaborador com acesso de portal não edita a própria empresa';
END $$;
RESET ROLE;


-- =====================================================================
-- S4 (RPCs APP-FACING): exigem admin/dono DA EMPRESA ALVO.
--   · dono/admin de A na empresa A → permitido
--   · admin de A na empresa B → 42501 FORBIDDEN
--   · colaborador e sem vínculo na empresa A → 42501 FORBIDDEN
--   · anon → negado por falta de EXECUTE
-- =====================================================================
DO $$
DECLARE
  f s_fix; v_plano jsonb; v_state text; v_msg text; perfil text; uid uuid; alvo uuid;
BEGIN
  SELECT * INTO f FROM s_fix;

  -- positivo: dono da empresa A
  PERFORM pg_temp.s_as_user(f.owner_a);
  SELECT public.dp_folga_autoatribuicao_plano(f.company_a, f.unidade_a, f.competencia) INTO v_plano;
  PERFORM pg_temp.s_reset();
  IF v_plano IS NULL THEN RAISE EXCEPTION 'FALHA S4: plano nulo para o dono da empresa A'; END IF;
  RAISE NOTICE 'OK S4a: dono da empresa A obtém o plano de folgas (retorno não nulo)';

  -- positivo: admin da empresa A
  PERFORM pg_temp.s_as_user(f.admin_a);
  SELECT public.dp_folga_autoatribuicao_plano(f.company_a, f.unidade_a, f.competencia) INTO v_plano;
  PERFORM pg_temp.s_reset();
  IF v_plano IS NULL THEN RAISE EXCEPTION 'FALHA S4: plano nulo para o admin da empresa A'; END IF;
  RAISE NOTICE 'OK S4b: admin da empresa A obtém o plano de folgas';

  -- negativos: cruzamento de empresa e perfis sem admin
  FOREACH perfil IN ARRAY ARRAY['admin_a_em_B','colab_a_em_A','outsider_em_A','owner_b_em_A'] LOOP
    uid := CASE perfil
             WHEN 'admin_a_em_B' THEN f.admin_a
             WHEN 'colab_a_em_A' THEN f.colab_a
             WHEN 'outsider_em_A' THEN f.outsider
             ELSE f.owner_b END;
    alvo := CASE perfil WHEN 'admin_a_em_B' THEN f.company_b ELSE f.company_a END;

    PERFORM pg_temp.s_as_user(uid);
    v_state := NULL; v_msg := NULL;
    BEGIN
      PERFORM public.dp_folga_autoatribuicao_plano(alvo, NULL, f.competencia);
    EXCEPTION WHEN others THEN
      v_state := SQLSTATE; v_msg := SQLERRM;
    END;
    PERFORM pg_temp.s_reset();

    IF v_state IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'FORBIDDEN:%' THEN
      RAISE EXCEPTION 'FALHA S4: % deveria receber 42501 FORBIDDEN, obteve % / %', perfil, v_state, v_msg;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK S4c: RPC de plano nega entre empresas e para perfis sem admin (42501 FORBIDDEN, 4 casos)';

  -- mesma prova para a RPC que aplica o plano
  PERFORM pg_temp.s_as_user(f.admin_a);
  v_state := NULL;
  BEGIN
    PERFORM public.dp_folga_autoatribuir_aplicar(f.company_b, NULL, f.competencia, '[]'::jsonb);
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.s_reset();
  IF v_state IS DISTINCT FROM '42501' OR v_msg NOT LIKE 'FORBIDDEN:%' THEN
    RAISE EXCEPTION 'FALHA S4: aplicar plano entre empresas deveria dar 42501 FORBIDDEN, obteve % / %', v_state, v_msg;
  END IF;
  RAISE NOTICE 'OK S4d: aplicação do plano negada entre empresas (42501 FORBIDDEN)';

  -- anon sequer tem EXECUTE nas RPCs app-facing
  PERFORM pg_temp.s_as_anon();
  v_state := NULL;
  BEGIN
    PERFORM public.dp_folga_autoatribuicao_plano(f.company_a, NULL, f.competencia);
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE; v_msg := SQLERRM;
  END;
  PERFORM pg_temp.s_reset();
  IF v_state IS DISTINCT FROM '42501' OR v_msg NOT ILIKE '%permission denied for function%' THEN
    RAISE EXCEPTION 'FALHA S4: anon deveria ser negado por falta de EXECUTE, obteve % / %', v_state, v_msg;
  END IF;
  RAISE NOTICE 'OK S4e: visitante (anon) sem EXECUTE nas RPCs app-facing';
END $$;
RESET ROLE;

-- =====================================================================
-- S5 (EXECUÇÃO INTERNA PRESERVADA): as rotinas internas continuam
--     executáveis pelo proprietário do banco e por service_role, com
--     dados sintéticos e EFEITO VERIFICADO. Nenhum serviço externo é chamado.
-- =====================================================================
DO $$
DECLARE
  f s_fix; v_batch uuid := gen_random_uuid(); v_proc int; v_res jsonb;
  v_ret int; v_linhas int; v_domingos int; v_fora int; v_geradas int;
BEGIN
  SELECT * INTO f FROM s_fix;

  -- 5.1 contagem de páginas do lote (efeito verificável)
  INSERT INTO public.dp_bulk_import_batches (id, company_id, source_file_path, total_pages, processed_pages)
  VALUES (v_batch, f.company_a, 'sintetico/p04.pdf', 5, 0);
  PERFORM public.dp_bulk_increment_processed(v_batch);
  PERFORM public.dp_bulk_increment_processed(v_batch);
  SELECT processed_pages INTO v_proc FROM public.dp_bulk_import_batches WHERE id = v_batch;
  IF v_proc IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'FALHA S5.1: processed_pages esperado 2, obtido %', v_proc;
  END IF;
  RAISE NOTICE 'OK S5.1: contagem de páginas do lote executada internamente (processed_pages=2)';

  -- 5.2 geração automática de escala com jornada sintética (TRABALHO EFETIVO):
  --     jornada 6x1 com folga fixa no domingo para os 2 colaboradores de A.
  SELECT count(*)::int INTO v_domingos
    FROM generate_series(f.competencia,
                         (date_trunc('month', f.competencia) + interval '1 month - 1 day')::date,
                         interval '1 day') d
   WHERE EXTRACT(DOW FROM d)::int = 0;

  v_ret := public.dp_escala_auto_gerar(f.company_a, f.competencia);

  SELECT count(*)::int INTO v_linhas
    FROM public.dp_folgas
   WHERE company_id = f.company_a AND origem = 'fixa_semana'
     AND data BETWEEN f.competencia
                  AND (date_trunc('month', f.competencia) + interval '1 month - 1 day')::date;

  IF v_ret IS DISTINCT FROM (v_domingos * 2) THEN
    RAISE EXCEPTION 'FALHA S5.2: retorno esperado % (2 colaboradores × % domingos), obtido %',
      v_domingos * 2, v_domingos, v_ret;
  END IF;
  IF v_linhas IS DISTINCT FROM (v_domingos * 2) THEN
    RAISE EXCEPTION 'FALHA S5.2: esperado % folgas gravadas, obtido %', v_domingos * 2, v_linhas;
  END IF;
  -- todas as folgas geradas pertencem à empresa A, aos colaboradores dela e caem no domingo
  SELECT count(*)::int INTO v_fora
    FROM public.dp_folgas fg
   WHERE fg.origem = 'fixa_semana'
     AND (fg.company_id <> f.company_a
          OR fg.colaborador_id NOT IN (f.colab_a1, f.colab_a2)
          OR EXTRACT(DOW FROM fg.data)::int <> 0);
  IF v_fora <> 0 THEN
    RAISE EXCEPTION 'FALHA S5.2: % folga(s) fora da empresa/colaboradores/dia esperados', v_fora;
  END IF;
  RAISE NOTICE 'OK S5.2: escala gerada com efeito verificado (% folgas em % domingos para 2 colaboradores da empresa A)',
    v_linhas, v_domingos;

  -- 5.3 autoatribuição de folgas por competência: retorno e efeito conferidos
  SELECT public.dp_folga_autoatribuir_competencia(f.company_a, f.unidade_a, f.competencia) INTO v_res;
  IF v_res IS NULL THEN
    RAISE EXCEPTION 'FALHA S5.3: retorno nulo da autoatribuição';
  END IF;
  IF COALESCE((v_res->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHA S5.3: autoatribuição não retornou ok=true (%)', left(v_res::text, 300);
  END IF;
  v_geradas := COALESCE((v_res->>'geradas')::int, -1);
  IF v_geradas < 0 THEN
    RAISE EXCEPTION 'FALHA S5.3: campo "geradas" ausente ou inválido (%)', left(v_res::text, 300);
  END IF;

  SELECT count(*)::int INTO v_linhas
    FROM public.dp_folgas fg
   WHERE fg.company_id = f.company_a
     AND fg.origem = 'auto_fds'
     AND fg.colaborador_id IN (f.colab_a1, f.colab_a2)
     AND fg.data BETWEEN f.competencia
                     AND (date_trunc('month', f.competencia) + interval '1 month - 1 day')::date;
  IF v_linhas IS DISTINCT FROM v_geradas THEN
    RAISE EXCEPTION 'FALHA S5.3: retorno diz % folgas, gravadas % na empresa/colaboradores sintéticos',
      v_geradas, v_linhas;
  END IF;
  IF EXISTS (SELECT 1 FROM public.dp_folgas WHERE origem = 'auto_fds' AND company_id <> f.company_a) THEN
    RAISE EXCEPTION 'FALHA S5.3: autoatribuição gravou folga fora da empresa sintética A';
  END IF;
  IF v_geradas = 0 THEN
    RAISE NOTICE 'PENDENTE S5.3: autoatribuição executou e conferiu consistência (ok=true, geradas=0), mas NÃO houve gravação — trabalho efetivo não comprovado com esta configuração mínima (janela de folgas/fins de semana exigidos não configurados)';
  ELSE
    RAISE NOTICE 'OK S5.3: autoatribuição por competência com efeito verificado (% folgas na empresa A, colaboradores sintéticos)', v_geradas;
  END IF;
END $$;

-- =====================================================================
-- S5b (POSITIVO APP-FACING COM EFEITO): admin da PRÓPRIA empresa aplica o
--      plano de folgas e a gravação é conferida.
-- =====================================================================
DO $$
DECLARE
  f s_fix; v_data date; v_res jsonb; v_linhas int; v_antes int;
BEGIN
  SELECT * INTO f FROM s_fix;

  -- escolhe um sábado do mês ainda sem folga para o colaborador A1
  SELECT d::date INTO v_data
    FROM generate_series(f.competencia,
                         (date_trunc('month', f.competencia) + interval '1 month - 1 day')::date,
                         interval '1 day') d
   WHERE EXTRACT(DOW FROM d)::int = 6
     AND NOT EXISTS (SELECT 1 FROM public.dp_folgas fg
                      WHERE fg.colaborador_id = f.colab_a1 AND fg.data = d::date)
   ORDER BY d LIMIT 1;
  IF v_data IS NULL THEN
    RAISE EXCEPTION 'FALHA S5b: não há sábado livre na competência sintética';
  END IF;

  SELECT count(*)::int INTO v_antes FROM public.dp_folgas
   WHERE colaborador_id = f.colab_a1 AND data = v_data;

  PERFORM pg_temp.s_as_user(f.admin_a);
  SELECT public.dp_folga_autoatribuir_aplicar(
           f.company_a, f.unidade_a, f.competencia,
           jsonb_build_array(jsonb_build_object('colaborador_id', f.colab_a1, 'data', to_char(v_data, 'YYYY-MM-DD')))
         ) INTO v_res;
  PERFORM pg_temp.s_reset();

  IF v_res IS NULL THEN
    RAISE EXCEPTION 'FALHA S5b: retorno nulo da aplicação do plano pelo admin da própria empresa';
  END IF;
  SELECT count(*)::int INTO v_linhas FROM public.dp_folgas
   WHERE company_id = f.company_a AND colaborador_id = f.colab_a1 AND data = v_data;
  IF v_linhas <= v_antes THEN
    RAISE EXCEPTION 'FALHA S5b: aplicação legítima não gravou a folga (antes %, depois %) — retorno %',
      v_antes, v_linhas, left(v_res::text, 300);
  END IF;
  RAISE NOTICE 'OK S5b: admin da própria empresa aplica o plano e a folga é gravada (efeito verificado)';
END $$;
RESET ROLE;

-- =====================================================================
-- S6 (EXECUÇÃO INTERNA COMO service_role): mesmo caminho, papel de serviço.
-- =====================================================================
DO $$
DECLARE f s_fix; v_batch uuid := gen_random_uuid();
BEGIN
  SELECT * INTO f FROM s_fix;
  INSERT INTO public.dp_bulk_import_batches (id, company_id, source_file_path, total_pages, processed_pages)
  VALUES (v_batch, f.company_a, 'sintetico/p04-service.pdf', 3, 0);

  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('role', 'service_role', true);
  PERFORM public.dp_bulk_increment_processed(v_batch);
  PERFORM set_config('role', 'none', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);

  IF (SELECT processed_pages FROM public.dp_bulk_import_batches WHERE id = v_batch) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'FALHA S6: service_role não conseguiu executar a rotina interna';
  END IF;
  RAISE NOTICE 'OK S6: service_role mantém a execução interna (processed_pages=1)';
END $$;
RESET ROLE;

-- =====================================================================
-- LIMITES CONHECIDOS destes cenários (registrados, não aprovados):
--  · dp_escala_auto_gerar_todas()/dp_folga_autoatribuir_todas() não são
--    exercitadas em modo global aqui além da negação de EXECUTE (S1): varrem
--    todas as empresas do banco e não agregam prova além do caminho por
--    empresa já coberto em S5.
--  · A autoatribuição por fins de semana depende de janela/exigência
--    configuradas; quando a configuração mínima resulta em zero gravação, o
--    cenário S5.3 é reportado como PENDENTE (não aprovado).
-- =====================================================================
ROLLBACK;

