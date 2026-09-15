-- P0.4 — Pessoas 360°: rotinas internas fechadas e titularidade blindada.
-- Executa em transação revertida: nenhum dado de cliente é alterado e nenhuma
-- rotina de negócio (geração de escala/folgas) é executada.
--
-- Uso: psql -v ON_ERROR_STOP=1 -f supabase/tests/dp_internal_functions_p04.test.sql

BEGIN;

-- T1..T7: rotinas internas inacessíveis a anon/authenticated, preservando service_role.
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
    'public.dp_folga_autoatribuicao_previa(uuid, uuid, date)'
  ];
BEGIN
  FOREACH f IN ARRAY fns LOOP
    IF has_function_privilege('authenticated', f, 'EXECUTE')
       OR has_function_privilege('anon', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHA: % ainda executável por anon/authenticated', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION 'FALHA: % perdeu execução interna (service_role)', f;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK: rotinas internas fechadas, execução interna preservada';
END $$;

-- T8: RPCs app-facing preservadas para usuário logado.
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.dp_folga_autoatribuicao_plano(uuid, uuid, date)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.dp_folga_autoatribuir_aplicar(uuid, uuid, date, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALHA: fluxo legítimo de autoatribuição foi quebrado';
  END IF;
  RAISE NOTICE 'OK: RPCs app-facing preservadas (autorização de admin dentro do banco)';
END $$;

-- T9: administrador que não é dono não consegue assumir a titularidade da empresa.
DO $$
DECLARE
  v_company uuid; v_owner uuid; v_admin uuid; v_after uuid; v_bloqueado boolean := false;
BEGIN
  SELECT c.id, c.user_id INTO v_company, v_owner
    FROM public.companies c
    JOIN public.company_members m ON m.company_id = c.id
   WHERE m.user_id <> c.user_id
   LIMIT 1;
  IF v_company IS NULL THEN
    RAISE NOTICE 'SKIP: nenhum cenário admin-não-dono disponível';
    RETURN;
  END IF;
  SELECT m.user_id INTO v_admin FROM public.company_members m
   WHERE m.company_id = v_company AND m.user_id <> v_owner LIMIT 1;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  BEGIN
    UPDATE public.companies SET user_id = v_admin WHERE id = v_company;
    SELECT user_id INTO v_after FROM public.companies WHERE id = v_company;
    v_bloqueado := (v_after = v_owner);
  EXCEPTION WHEN others THEN
    v_bloqueado := true;
  END;

  IF NOT v_bloqueado THEN
    RAISE EXCEPTION 'FALHA: admin não-dono transferiu a titularidade';
  END IF;
  RAISE NOTICE 'OK: transferência de titularidade bloqueada para admin não-dono';
END $$;

ROLLBACK;
