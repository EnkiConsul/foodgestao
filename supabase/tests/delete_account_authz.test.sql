-- Testes de autorização da RPC public.delete_account
--
-- Simula diferentes identidades via `request.jwt.claims` e verifica que:
--  1. Dono da conta PF pode excluir de vez quando não há lançamentos.
--  2. Outro usuário NÃO pode excluir conta PF alheia.
--  3. Anônimo (sem JWT) NÃO pode excluir.
--  4. Admin da empresa pode excluir conta PJ.
--  5. Membro comum (não admin/owner) NÃO pode excluir conta PJ.
--  6. Conta com lançamentos é ARQUIVADA (soft) e não removida.
--
-- Todo o teste roda em uma transação com ROLLBACK no fim: nada é persistido.

BEGIN;

-- Cria usuários no auth.users (mínimo para satisfazer FKs).
INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'owner-pf@test.local',   'authenticated', 'authenticated', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'outsider@test.local',   'authenticated', 'authenticated', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'company-admin@test.local','authenticated', 'authenticated', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'company-viewer@test.local','authenticated', 'authenticated', now(), now());

-- Empresa + membros
INSERT INTO public.companies (id, user_id, owner_id, name, profile_type, status_tenant, is_active)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '33333333-3333-3333-3333-333333333333',
        '33333333-3333-3333-3333-333333333333',
        'Empresa Teste', 'microempresa', 'ativo', true);

INSERT INTO public.company_members (company_id, user_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'admin'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'viewer')
ON CONFLICT DO NOTHING;

-- Contas de teste
INSERT INTO public.accounts (id, user_id, name, type, context, initial_balance, current_balance)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', '11111111-1111-1111-1111-111111111111',
        'PF Owner Conta', 'corrente', 'pf', 0, 0);

INSERT INTO public.accounts (id, user_id, company_id, name, type, context, initial_balance, current_balance)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '33333333-3333-3333-3333-333333333333',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PJ Admin Conta',  'corrente', 'pj', 0, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3', '33333333-3333-3333-3333-333333333333',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PJ Viewer Conta', 'corrente', 'pj', 0, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', '11111111-1111-1111-1111-111111111111',
   NULL, 'PF Com Movimento', 'corrente', 'pf', 0, 0);

-- Lança um movimento na conta 4 para forçar o cenário "soft"
INSERT INTO public.transactions
  (id, user_id, account_id, type, description, amount, date, status)
VALUES
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4', 'receita', 'seed', 10, current_date, 'confirmado');

-- ============================================================
-- Caso 1: dono PF exclui de vez sua conta vazia -> 'hard'
-- ============================================================
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE r text;
BEGIN
  SELECT public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') INTO r;
  IF r <> 'hard' THEN
    RAISE EXCEPTION 'CASO 1 FALHOU: esperava hard, obteve %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1') THEN
    RAISE EXCEPTION 'CASO 1 FALHOU: conta não foi removida';
  END IF;
END $$;

-- ============================================================
-- Caso 2: outro usuário NÃO consegue excluir conta PF alheia
-- ============================================================
RESET role;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4');
    RAISE EXCEPTION 'CASO 2 FALHOU: usuário estranho conseguiu excluir conta alheia';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%permission denied%' THEN
      RAISE EXCEPTION 'CASO 2 FALHOU: erro inesperado: %', SQLERRM;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4' AND is_active) THEN
    RAISE EXCEPTION 'CASO 2 FALHOU: conta foi alterada indevidamente';
  END IF;
END $$;

-- ============================================================
-- Caso 3: anônimo (sem sub) NÃO consegue excluir
-- ============================================================
RESET role;
SET LOCAL role = anon;
SET LOCAL "request.jwt.claims" = '{"role":"anon"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4');
    RAISE EXCEPTION 'CASO 3 FALHOU: anônimo conseguiu executar';
  EXCEPTION WHEN OTHERS THEN
    -- aceita "permission denied" (função) OU erro de privilégio de execução (revoked de anon)
    IF SQLERRM NOT ILIKE '%permission denied%' AND SQLERRM NOT ILIKE '%permission%' THEN
      RAISE EXCEPTION 'CASO 3 FALHOU: erro inesperado: %', SQLERRM;
    END IF;
  END;
END $$;

-- ============================================================
-- Caso 4: admin da empresa exclui conta PJ vazia -> 'hard'
-- ============================================================
RESET role;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

DO $$
DECLARE r text;
BEGIN
  SELECT public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2') INTO r;
  IF r <> 'hard' THEN
    RAISE EXCEPTION 'CASO 4 FALHOU: esperava hard, obteve %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2') THEN
    RAISE EXCEPTION 'CASO 4 FALHOU: conta PJ não removida';
  END IF;
END $$;

-- ============================================================
-- Caso 5: viewer da empresa NÃO consegue excluir conta PJ
-- ============================================================
RESET role;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

DO $$
BEGIN
  BEGIN
    PERFORM public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3');
    RAISE EXCEPTION 'CASO 5 FALHOU: viewer conseguiu excluir';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT ILIKE '%permission denied%' THEN
      RAISE EXCEPTION 'CASO 5 FALHOU: erro inesperado: %', SQLERRM;
    END IF;
  END;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3' AND is_active) THEN
    RAISE EXCEPTION 'CASO 5 FALHOU: conta PJ foi alterada indevidamente';
  END IF;
END $$;

-- ============================================================
-- Caso 6: dono PF com lançamentos -> 'soft' (arquiva, não apaga)
-- ============================================================
RESET role;
SET LOCAL role = authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

DO $$
DECLARE r text;
BEGIN
  SELECT public.delete_account('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4') INTO r;
  IF r <> 'soft' THEN
    RAISE EXCEPTION 'CASO 6 FALHOU: esperava soft, obteve %', r;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
     WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4'
       AND is_active = false
       AND soft_deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CASO 6 FALHOU: conta com histórico deveria estar arquivada';
  END IF;
END $$;

SELECT '✔ todos os 6 casos de autorização passaram' AS resultado;

ROLLBACK;
