-- P0.4 — Pessoas 360°: rotinas internas fechadas e titularidade blindada.
--
-- ⚠ ATENÇÃO: este script cria FIXTURES SINTÉTICAS (usuários em auth.users e uma
-- empresa fictícia) e usa DISABLE TRIGGER na tabela public.companies. Ele deve
-- rodar EXCLUSIVAMENTE em banco isolado de teste/CI — NUNCA em produção, mesmo
-- que a transação termine em ROLLBACK (o DISABLE/ENABLE TRIGGER exige lock na
-- tabela e um erro fora de hora deixaria gatilhos desabilitados).
--
-- Executa em UMA transação revertida (ROLLBACK no final): nenhum dado real é
-- alterado e nenhuma rotina de negócio (geração de escala/folgas) é executada.
-- Todos os cenários de titularidade usam apenas as fixtures sintéticas — nunca
-- empresas ou usuários reais.
--
-- Requisitos: conexão com papel proprietário do banco (precisa inserir em
-- auth.users para satisfazer a FK companies.user_id, assumir o papel
-- `authenticated` e desabilitar gatilhos temporariamente para isolar a policy).
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/dp_internal_functions_p04.test.sql
--   (o script aborta com exceção no primeiro cenário que falhar)


\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- T1: as 9 rotinas internas (inclui as 2 usadas como trigger) sem EXECUTE
--     para anon/authenticated/PUBLIC e com service_role preservado.
-- =====================================================================
DO $$
DECLARE
  f text;
  fns text[] := ARRAY[
    'public.dp_bulk_increment_processed(uuid)',
    'public.dp_escala_auto_gerar(uuid, date)',
    'public.dp_escala_auto_gerar_todas()',
    'public.dp_folga_autoatribuir_todas()',
    'public.dp_folga_autoatribuir_competencia(uuid, uuid, date)',
    'public.dp_folga_autoatribuir_manual(uuid, uuid, date)',
    'public.dp_folga_autoatribuicao_previa(uuid, uuid, date)',
    'public.dp_escala_item_validar_setor()',
    'public.dp_folgas_validar_unificado()'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHA T1: % executável por authenticated', f;
    END IF;
    IF has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHA T1: % executável por anon', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHA T1: % perdeu execução interna (service_role)', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK T1: 9 rotinas internas fechadas, service_role preservado';
END $$;

-- T1b: nenhum EXECUTE para PUBLIC nas mesmas rotinas.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN aclexplode(p.proacl) a ON a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     WHERE n.nspname = 'public'
       AND p.proname IN ('dp_bulk_increment_processed','dp_escala_auto_gerar',
         'dp_escala_auto_gerar_todas','dp_folga_autoatribuir_todas',
         'dp_folga_autoatribuir_competencia','dp_folga_autoatribuir_manual',
         'dp_folga_autoatribuicao_previa','dp_escala_item_validar_setor',
         'dp_folgas_validar_unificado')
       AND a.grantee IS NOT NULL
  LOOP
    RAISE EXCEPTION 'FALHA T1b: % com EXECUTE para PUBLIC', r.proname;
  END LOOP;
  RAISE NOTICE 'OK T1b: nenhuma rotina interna liberada para PUBLIC';
END $$;

-- =====================================================================
-- T2: gatilhos que usam as rotinas internas continuam ativos.
-- =====================================================================
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal
     AND p.proname IN ('dp_escala_item_validar_setor','dp_folgas_validar_unificado')
     AND t.tgenabled = 'O';
  IF v_n < 2 THEN
    RAISE EXCEPTION 'FALHA T2: gatilhos de validação de escala/folga ausentes ou desabilitados (%).', v_n;
  END IF;
  RAISE NOTICE 'OK T2: gatilhos de validação ativos (%)', v_n;
END $$;

-- =====================================================================
-- T3: RPCs app-facing preservadas para usuário logado.
-- =====================================================================
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.dp_folga_autoatribuicao_plano(uuid, uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.dp_folga_autoatribuir_aplicar(uuid, uuid, date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA T3: fluxo legítimo de autoatribuição foi quebrado';
  END IF;
  IF has_function_privilege('anon', 'public.dp_folga_autoatribuicao_plano(uuid, uuid, date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.dp_folga_autoatribuir_aplicar(uuid, uuid, date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA T3: RPC app-facing exposta a visitante';
  END IF;
  RAISE NOTICE 'OK T3: RPCs app-facing preservadas para authenticated e fechadas para anon';
END $$;

-- =====================================================================
-- FIXTURES SINTÉTICAS para os cenários de companies (T4..T8).
-- =====================================================================
CREATE TEMP TABLE p04_fix (
  owner_id uuid, admin_id uuid, outsider_id uuid, company_id uuid
) ON COMMIT DROP;

DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_out   uuid := gen_random_uuid();
  v_comp  uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'p04-owner-' || v_owner || '@example.test', '', now(), now(), now()),
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'p04-admin-' || v_admin || '@example.test', '', now(), now(), now()),
    (v_out, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'p04-out-' || v_out || '@example.test', '', now(), now(), now());

  INSERT INTO public.companies (id, user_id, name, is_active, profile_type, status_tenant)
  VALUES (v_comp, v_owner, 'P04 FIXTURE LTDA', true, 'pj', 'active');

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (v_comp, v_admin, 'admin')
  ON CONFLICT DO NOTHING;

  INSERT INTO p04_fix VALUES (v_owner, v_admin, v_out, v_comp);
  RAISE NOTICE 'OK fixtures: empresa sintética % criada', v_comp;
END $$;

-- Helper: aplica claims de um usuário sintético e assume o papel authenticated.
CREATE OR REPLACE FUNCTION pg_temp.p04_as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('role', 'authenticated', true);
END $$;

-- =====================================================================
-- T4 (POSITIVO): admin não-dono edita campo comum da empresa sintética.
-- =====================================================================
DO $$
DECLARE f p04_fix; v_name text;
BEGIN
  SELECT * INTO f FROM p04_fix;
  PERFORM pg_temp.p04_as_user(f.admin_id);
  UPDATE public.companies SET name = 'P04 EDITADO PELO ADMIN' WHERE id = f.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA T4: admin não conseguiu editar campo comum (policy bloqueou fluxo legítimo)';
  END IF;
  SELECT name INTO v_name FROM public.companies WHERE id = f.company_id;
  IF v_name IS DISTINCT FROM 'P04 EDITADO PELO ADMIN' THEN
    RAISE EXCEPTION 'FALHA T4: edição do admin não persistiu (%).', v_name;
  END IF;
  PERFORM set_config('role', 'none', true);
  RAISE NOTICE 'OK T4: admin não-dono edita dados comuns normalmente';
END $$;
RESET ROLE;

-- =====================================================================
-- T5 (POSITIVO): dono edita campo comum e transfere titularidade (permitido).
-- =====================================================================
DO $$
DECLARE f p04_fix; v_owner_after uuid;
BEGIN
  SELECT * INTO f FROM p04_fix;
  PERFORM pg_temp.p04_as_user(f.owner_id);

  UPDATE public.companies SET name = 'P04 EDITADO PELO DONO' WHERE id = f.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA T5: dono não conseguiu editar campo comum';
  END IF;

  UPDATE public.companies SET user_id = f.admin_id WHERE id = f.company_id;
  SELECT user_id INTO v_owner_after FROM public.companies WHERE id = f.company_id;
  IF v_owner_after IS DISTINCT FROM f.admin_id THEN
    RAISE EXCEPTION 'FALHA T5: dono legítimo não conseguiu transferir a titularidade';
  END IF;

  -- devolve para o dono original (ainda dentro da transação revertida)
  PERFORM set_config('role', 'none', true);
  RAISE NOTICE 'OK T5: dono edita e transfere titularidade (caso positivo)';
END $$;
RESET ROLE;

UPDATE public.companies SET user_id = (SELECT owner_id FROM p04_fix)
 WHERE id = (SELECT company_id FROM p04_fix);

-- =====================================================================
-- T6 (NEGATIVO, gatilhos + policy): admin não-dono não assume titularidade.
-- =====================================================================
DO $$
DECLARE
  f p04_fix;
  v_state text := NULL;
  v_msg text := NULL;
  v_rows int := 0;
  v_after uuid;
BEGIN
  SELECT * INTO f FROM p04_fix;
  PERFORM pg_temp.p04_as_user(f.admin_id);

  -- O bloco de captura contém APENAS o UPDATE: nenhuma asserção aqui, para não
  -- capturar a própria falha do teste.
  BEGIN
    UPDATE public.companies SET user_id = f.admin_id WHERE id = f.company_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;

  -- restaura o papel ANTES da leitura verificadora
  PERFORM set_config('role', 'none', true);
  RESET ROLE;

  SELECT user_id INTO v_after FROM public.companies WHERE id = f.company_id;

  -- Asserções fora do bloco de captura.
  IF v_after IS DISTINCT FROM f.owner_id THEN
    RAISE EXCEPTION 'FALHA T6: titular final inesperado (esperado %, obtido %)', f.owner_id, v_after;
  END IF;

  IF v_state IS NULL THEN
    -- sem erro: só é aceitável se o UPDATE não afetou nenhuma linha (RLS filtrou)
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'FALHA T6: UPDATE de titularidade afetou % linha(s) sem erro', v_rows;
    END IF;
    RAISE NOTICE 'OK T6: transferência por admin não-dono sem efeito (0 linhas, RLS filtrou)';
  ELSIF v_state = '42501' THEN
    RAISE NOTICE 'OK T6: transferência bloqueada por RLS (42501)';
  ELSIF v_state = 'P0001' AND v_msg IN (
      'Apenas o dono da empresa pode transferir a titularidade',
      'Somente o proprietário atual da empresa ou um super admin pode transferir a titularidade',
      'Ownership transfer is not allowed'
  ) THEN
    RAISE NOTICE 'OK T6: transferência bloqueada por gatilho existente (%)', v_msg;
  ELSE
    RAISE EXCEPTION 'FALHA T6: negação inesperada % / %', v_state, v_msg;
  END IF;
END $$;


-- =====================================================================
-- T7 (NEGATIVO, POLICY ISOLADA): com os gatilhos de titularidade
--     desabilitados, a nova policy (WITH CHECK) ainda bloqueia o admin.
--     Isso separa o mérito da policy do mérito dos gatilhos.
-- =====================================================================
ALTER TABLE public.companies DISABLE TRIGGER companies_guard_owner_transfer;
ALTER TABLE public.companies DISABLE TRIGGER guard_company_owner_transfer;
ALTER TABLE public.companies DISABLE TRIGGER prevent_company_ownership_transfer_trg;

DO $$
DECLARE f p04_fix; v_after uuid; v_sqlstate text := '';
BEGIN
  SELECT * INTO f FROM p04_fix;
  PERFORM pg_temp.p04_as_user(f.admin_id);
  BEGIN
    UPDATE public.companies SET user_id = f.admin_id WHERE id = f.company_id;
  EXCEPTION WHEN others THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM set_config('role', 'none', true);

  SELECT user_id INTO v_after FROM public.companies WHERE id = f.company_id;
  IF v_after IS DISTINCT FROM f.owner_id THEN
    RAISE EXCEPTION 'FALHA T7: sem os gatilhos, a policy permitiu a transferência';
  END IF;
  IF v_sqlstate IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION 'FALHA T7: esperado 42501 (violação de RLS) pela policy, obtido "%"', v_sqlstate;
  END IF;
  RAISE NOTICE 'OK T7: policy sozinha bloqueia a transferência (SQLSTATE 42501)';
END $$;
RESET ROLE;

-- T7b (POSITIVO, policy isolada): com gatilhos desabilitados, o admin ainda
-- consegue editar campos comuns — a policy não bloqueia fluxo legítimo.
DO $$
DECLARE f p04_fix;
BEGIN
  SELECT * INTO f FROM p04_fix;
  PERFORM pg_temp.p04_as_user(f.admin_id);
  UPDATE public.companies SET name = 'P04 ADMIN SEM TRIGGERS' WHERE id = f.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FALHA T7b: policy bloqueou edição comum do admin';
  END IF;
  PERFORM set_config('role', 'none', true);
  RAISE NOTICE 'OK T7b: policy permite edição comum de admin';
END $$;
RESET ROLE;

ALTER TABLE public.companies ENABLE TRIGGER companies_guard_owner_transfer;
ALTER TABLE public.companies ENABLE TRIGGER guard_company_owner_transfer;
ALTER TABLE public.companies ENABLE TRIGGER prevent_company_ownership_transfer_trg;

-- =====================================================================
-- T8 (NEGATIVO): usuário sem vínculo não edita nada da empresa sintética.
-- =====================================================================
DO $$
DECLARE
  f p04_fix;
  v_name text;
  v_after text;
  v_state text := NULL;
  v_msg text := NULL;
  v_rows int := 0;
BEGIN
  SELECT * INTO f FROM p04_fix;
  SELECT name INTO v_name FROM public.companies WHERE id = f.company_id;
  PERFORM pg_temp.p04_as_user(f.outsider_id);

  -- somente o UPDATE dentro da captura; erros inesperados falham nas asserções
  BEGIN
    UPDATE public.companies SET name = 'P04 INVASOR' WHERE id = f.company_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN others THEN
    v_state := SQLSTATE;
    v_msg := SQLERRM;
  END;

  PERFORM set_config('role', 'none', true);
  RESET ROLE;

  SELECT name INTO v_after FROM public.companies WHERE id = f.company_id;
  IF v_after IS DISTINCT FROM v_name THEN
    RAISE EXCEPTION 'FALHA T8: usuário sem vínculo alterou a empresa (% -> %)', v_name, v_after;
  END IF;

  IF v_state IS NULL THEN
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'FALHA T8: UPDATE de terceiro afetou % linha(s)', v_rows;
    END IF;
    RAISE NOTICE 'OK T8: usuário sem vínculo — UPDATE sem efeito (0 linhas)';
  ELSIF v_state = '42501' THEN
    RAISE NOTICE 'OK T8: usuário sem vínculo bloqueado por RLS (42501)';
  ELSE
    RAISE EXCEPTION 'FALHA T8: erro inesperado % / %', v_state, v_msg;
  END IF;
END $$;


ROLLBACK;
