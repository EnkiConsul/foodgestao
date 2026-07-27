-- 1) Corrige o gatilho que bloqueava toda exclusão definitiva.
CREATE OR REPLACE FUNCTION public.prevent_hard_delete_account_with_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE account_id = OLD.id
        OR destination_account_id = OLD.id
        OR connection_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'conta possui lancamentos; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM public.open_finance_accounts WHERE local_account_id = OLD.id) THEN
    RAISE EXCEPTION 'conta esta vinculada a uma conexao Open Finance; desconecte antes de excluir' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.credit_card_invoices ci
      LEFT JOIN public.transactions t ON t.id = ci.payment_transaction_id
      LEFT JOIN public.credit_cards  c ON c.id = ci.credit_card_id
     WHERE t.account_id = OLD.id
        OR c.default_payment_account_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'conta possui faturas de cartao vinculadas; use soft_delete_account()' USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END $$;

-- 2) Suíte de autorização.
CREATE OR REPLACE FUNCTION public._test_delete_account_authz()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u_owner  uuid := '11111111-aaaa-4aaa-8aaa-000000000001';
  u_other  uuid := '11111111-aaaa-4aaa-8aaa-000000000002';
  u_admin  uuid := '11111111-aaaa-4aaa-8aaa-000000000003';
  u_viewer uuid := '11111111-aaaa-4aaa-8aaa-000000000004';
  c_id     uuid := '22222222-aaaa-4aaa-8aaa-000000000001';
  a_pf_v   uuid := '33333333-aaaa-4aaa-8aaa-000000000001';
  a_pj_a   uuid := '33333333-aaaa-4aaa-8aaa-000000000002';
  a_pj_v   uuid := '33333333-aaaa-4aaa-8aaa-000000000003';
  a_pf_h   uuid := '33333333-aaaa-4aaa-8aaa-000000000004';
  r        text;
  denied   boolean;
BEGIN
  -- cleanup defensivo
  DELETE FROM public.transactions   WHERE account_id IN (a_pf_v, a_pj_a, a_pj_v, a_pf_h);
  DELETE FROM public.accounts       WHERE id IN (a_pf_v, a_pj_a, a_pj_v, a_pf_h);
  DELETE FROM public.company_members WHERE company_id = c_id;
  DELETE FROM public.companies      WHERE id = c_id;
  DELETE FROM auth.users            WHERE id IN (u_owner, u_other, u_admin, u_viewer);

  INSERT INTO auth.users (id, instance_id, email, aud, role, created_at, updated_at) VALUES
    (u_owner,  '00000000-0000-0000-0000-000000000000', 'test-owner@authz.local',  'authenticated','authenticated', now(), now()),
    (u_other,  '00000000-0000-0000-0000-000000000000', 'test-other@authz.local',  'authenticated','authenticated', now(), now()),
    (u_admin,  '00000000-0000-0000-0000-000000000000', 'test-admin@authz.local',  'authenticated','authenticated', now(), now()),
    (u_viewer, '00000000-0000-0000-0000-000000000000', 'test-viewer@authz.local', 'authenticated','authenticated', now(), now());

  ALTER TABLE public.companies DISABLE TRIGGER dp_config_dp_seed;
  INSERT INTO public.companies (id, user_id, name, profile_type, status_tenant, is_active)
  VALUES (c_id, u_admin, 'AuthZ Test Co', 'empresarial', 'ativa', true);
  ALTER TABLE public.companies ENABLE TRIGGER dp_config_dp_seed;

  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (c_id, u_viewer, 'viewer')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.accounts (id, user_id, name, account_type, context, initial_balance, current_balance) VALUES
    (a_pf_v, u_owner, 'PF vazia',          'corrente', 'pf', 0, 0),
    (a_pf_h, u_owner, 'PF com histórico',  'corrente', 'pf', 0, 0);
  INSERT INTO public.accounts (id, user_id, company_id, name, account_type, context, initial_balance, current_balance) VALUES
    (a_pj_a, u_admin, c_id, 'PJ p/ admin',  'corrente', 'pj', 0, 0),
    (a_pj_v, u_admin, c_id, 'PJ p/ viewer', 'corrente', 'pj', 0, 0);

  INSERT INTO public.transactions
    (id, user_id, account_id, context, transaction_type, description, amount, transaction_date, status)
  VALUES
    (gen_random_uuid(), u_owner, a_pf_h, 'pf', 'receita', 'seed', 10, current_date, 'confirmado');

  -- Caso 1: dono PF -> hard
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  SELECT public.delete_account(a_pf_v) INTO r;
  IF r <> 'hard' THEN RAISE EXCEPTION 'CASO 1: esperava hard, obteve %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = a_pf_v) THEN
    RAISE EXCEPTION 'CASO 1: conta PF vazia não foi removida';
  END IF;

  -- Caso 2: terceiro não pode
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_other, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM public.delete_account(a_pf_h);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission denied%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 2: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 2: terceiro conseguiu excluir'; END IF;

  -- Caso 3: anônimo (sem sub) não pode
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  denied := false;
  BEGIN
    PERFORM public.delete_account(a_pf_h);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 3: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 3: anônimo conseguiu executar'; END IF;

  -- Caso 4: admin PJ -> hard
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  SELECT public.delete_account(a_pj_a) INTO r;
  IF r <> 'hard' THEN RAISE EXCEPTION 'CASO 4: esperava hard, obteve %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.accounts WHERE id = a_pj_a) THEN
    RAISE EXCEPTION 'CASO 4: conta PJ não removida';
  END IF;

  -- Caso 5: viewer PJ não pode
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_viewer, 'role', 'authenticated')::text, true);
  denied := false;
  BEGIN
    PERFORM public.delete_account(a_pj_v);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%permission denied%' THEN denied := true;
    ELSE RAISE EXCEPTION 'CASO 5: erro inesperado: %', SQLERRM; END IF;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'CASO 5: viewer conseguiu excluir'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = a_pj_v AND is_active) THEN
    RAISE EXCEPTION 'CASO 5: conta PJ foi alterada indevidamente';
  END IF;

  -- Caso 6: dono PF com histórico -> soft
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  SELECT public.delete_account(a_pf_h) INTO r;
  IF r <> 'soft' THEN RAISE EXCEPTION 'CASO 6: esperava soft, obteve %', r; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts
     WHERE id = a_pf_h AND is_active = false AND soft_deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'CASO 6: conta deveria estar arquivada';
  END IF;

  -- cleanup final
  DELETE FROM public.transactions   WHERE account_id IN (a_pf_v, a_pj_a, a_pj_v, a_pf_h);
  DELETE FROM public.accounts       WHERE id IN (a_pf_v, a_pj_a, a_pj_v, a_pf_h);
  DELETE FROM public.company_members WHERE company_id = c_id;
  DELETE FROM public.companies      WHERE id = c_id;
  DELETE FROM auth.users            WHERE id IN (u_owner, u_other, u_admin, u_viewer);

  RETURN 'ok: 6 casos de autorização passaram';
END $$;

REVOKE ALL ON FUNCTION public._test_delete_account_authz() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_delete_account_authz() TO service_role;

SELECT public._test_delete_account_authz();