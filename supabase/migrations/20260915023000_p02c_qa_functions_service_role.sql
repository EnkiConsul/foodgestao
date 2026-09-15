-- P0.2-C — Rotinas de QA/E2E acessíveis somente por service_role.
--
-- Mudanças:
--  1) `_assert_test_helper_allowed()` deixa de aceitar `super_admin`: agora só
--     `service_role` (chave de serviço) ou conexão direta ao banco (migrations,
--     manutenção) — fail closed para qualquer sessão de usuário.
--  2) As rotinas `_e2e_*` e `_test_delete_account_hard_regression` passam a
--     receber `_user_id uuid` explícito, porque com `service_role` não existe
--     `auth.uid()`. Quando há sessão (uso legado), `auth.uid()` tem precedência.
--  3) `REVOKE EXECUTE` de `authenticated`, `anon` e `PUBLIC` em TODAS as rotinas
--     `_e2e_*`/`_test_*`. Somente `service_role` executa.
--
-- Idempotente. Nenhum INSERT/UPDATE/DELETE em dados reais.

-- 1) Guarda: service_role ou conexão direta apenas.
CREATE OR REPLACE FUNCTION public._assert_test_helper_allowed()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _jwt_role text := coalesce(
    current_setting('request.jwt.claim.role', true),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role'
  );
BEGIN
  -- Chave de servico (E2E/CI server-side, Edge Functions).
  IF _jwt_role = 'service_role' THEN
    RETURN;
  END IF;
  -- Conexao direta ao banco (migrations, cron, manutencao): sem JWT algum.
  IF _jwt_role IS NULL AND _uid IS NULL THEN
    RETURN;
  END IF;
  RAISE EXCEPTION
    'permission denied: rotina de QA exige service_role (execucao server-side)'
    USING ERRCODE = '42501';
END $function$;

REVOKE ALL ON FUNCTION public._assert_test_helper_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._assert_test_helper_allowed() TO service_role;

-- 2) Rotinas de QA com `_user_id` explícito.
DROP FUNCTION IF EXISTS public._e2e_seed_delete_accounts(text, text);
CREATE FUNCTION public._e2e_seed_delete_accounts(_empty_name text, _history_name text, _user_id uuid DEFAULT NULL)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := coalesce(auth.uid(), _user_id);
  cid uuid;
  ctx context_type;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;
  IF _empty_name !~ '^E2E-' OR _history_name !~ '^E2E-' THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;

  SELECT c.id INTO cid
    FROM public.companies c
   WHERE c.user_id = uid AND c.is_active = true
   ORDER BY c.created_at
   LIMIT 1;
  ctx := CASE WHEN cid IS NULL THEN 'pf'::context_type ELSE 'pj'::context_type END;

  INSERT INTO public.accounts (user_id, company_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (uid, cid, _empty_name,   'corrente', ctx, 0, 0, true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts (user_id, company_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (uid, cid, _history_name, 'corrente', ctx, 0, 0, true)
    RETURNING id INTO a_hist;
  INSERT INTO public.transactions
    (user_id, company_id, account_id, context, transaction_type,
     description, amount, transaction_date, status)
    VALUES (uid, cid, a_hist, ctx, 'entrada', 'e2e seed', 10, current_date, 'confirmado')
    RETURNING id INTO t_id;

  RETURN QUERY SELECT a_empty, a_hist, t_id, cid;
END $function$;

DROP FUNCTION IF EXISTS public._e2e_cleanup_delete_accounts(text[]);
CREATE FUNCTION public._e2e_cleanup_delete_accounts(_names text[], _user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := coalesce(auth.uid(), _user_id);
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_names) n WHERE n !~ '^E2E-') THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;
  DELETE FROM public.transactions
   WHERE user_id = uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = uid AND name = ANY(_names));
  DELETE FROM public.accounts WHERE user_id = uid AND name = ANY(_names);
END $function$;

DROP FUNCTION IF EXISTS public._e2e_seed_foreign_accounts(text, text);
CREATE FUNCTION public._e2e_seed_foreign_accounts(_empty_name text, _history_name text, _user_id uuid DEFAULT NULL)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, foreign_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := coalesce(auth.uid(), _user_id);
  other uuid;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;
  IF _empty_name !~ '^E2E-FOREIGN-' OR _history_name !~ '^E2E-FOREIGN-' THEN
    RAISE EXCEPTION 'names must start with E2E-FOREIGN-';
  END IF;

  SELECT id INTO other FROM auth.users WHERE id <> uid ORDER BY created_at LIMIT 1;
  IF other IS NULL THEN RAISE EXCEPTION 'nao existe outro usuario para simular acesso nao autorizado'; END IF;

  INSERT INTO public.accounts (user_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (other, _empty_name, 'corrente', 'pf', 0, 0, true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts (user_id, name, account_type, context,
                               initial_balance, current_balance, is_active)
    VALUES (other, _history_name, 'corrente', 'pf', 0, 0, true)
    RETURNING id INTO a_hist;
  INSERT INTO public.transactions
    (user_id, account_id, context, transaction_type,
     description, amount, transaction_date, status)
    VALUES (other, a_hist, 'pf', 'entrada', 'e2e foreign seed', 10, current_date, 'confirmado')
    RETURNING id INTO t_id;

  RETURN QUERY SELECT a_empty, a_hist, t_id, other;
END $function$;

CREATE OR REPLACE FUNCTION public._e2e_cleanup_foreign_accounts(_empty_name text, _history_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF _empty_name !~ '^E2E-FOREIGN-' OR _history_name !~ '^E2E-FOREIGN-' THEN
    RAISE EXCEPTION 'names must start with E2E-FOREIGN-';
  END IF;
  DELETE FROM public.transactions
   WHERE description = 'e2e foreign seed'
     AND account_id IN (SELECT id FROM public.accounts WHERE name IN (_empty_name, _history_name));
  DELETE FROM public.accounts WHERE name IN (_empty_name, _history_name);
END $function$;

DROP FUNCTION IF EXISTS public._e2e_seed_adjust_balance(text);
CREATE FUNCTION public._e2e_seed_adjust_balance(_account_name text, _user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := coalesce(auth.uid(), _user_id);
  _id  uuid;
  _company_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF _uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;
  IF _account_name !~ '^E2E-' THEN RAISE EXCEPTION 'names must start with E2E-'; END IF;

  SELECT c.id INTO _company_id
    FROM public.companies c
   WHERE c.is_active = true
     AND (c.user_id = _uid
          OR EXISTS (SELECT 1 FROM public.company_members m
                      WHERE m.company_id = c.id AND m.user_id = _uid))
   ORDER BY c.created_at ASC
   LIMIT 1;

  PERFORM set_config('app.balance_engine', 'on', true);
  IF _company_id IS NULL THEN
    INSERT INTO public.accounts (user_id, name, account_type, context, initial_balance, current_balance)
    VALUES (_uid, _account_name, 'corrente', 'pf', 100, 100)
    RETURNING id INTO _id;
  ELSE
    INSERT INTO public.accounts (user_id, company_id, name, account_type, context, initial_balance, current_balance)
    VALUES (_uid, _company_id, _account_name, 'corrente', 'pj', 100, 100)
    RETURNING id INTO _id;
  END IF;
  PERFORM set_config('app.balance_engine', '', true);

  RETURN _id;
END $function$;

DROP FUNCTION IF EXISTS public._e2e_cleanup_adjust_balance(text);
CREATE FUNCTION public._e2e_cleanup_adjust_balance(_account_name text, _user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := coalesce(auth.uid(), _user_id);
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF _uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;
  IF _account_name !~ '^E2E-' THEN RAISE EXCEPTION 'names must start with E2E-'; END IF;
  PERFORM set_config('app.balance_engine', 'on', true);
  DELETE FROM public.transactions
   WHERE user_id = _uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = _uid AND name = _account_name);
  DELETE FROM public.accounts WHERE user_id = _uid AND name = _account_name;
  PERFORM set_config('app.balance_engine', '', true);
END $function$;

DROP FUNCTION IF EXISTS public._test_delete_account_hard_regression();
CREATE FUNCTION public._test_delete_account_hard_regression(_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := coalesce(auth.uid(), _user_id);
  a_empty uuid; a_pay uuid; a_guard uuid;
  cc uuid; inv uuid;
  res text;
  guarded boolean := false;
  still_exists boolean;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'informe _user_id (execucao server-side sem sessao)'; END IF;

  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'E2E-REG-Empty-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'E2E-REG-Pay-'   || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_pay;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'E2E-REG-Guard-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_guard;

  INSERT INTO public.credit_cards(user_id, context, brand, last4, credit_limit,
                                  closing_day, due_day, default_payment_account_id,
                                  is_corporate, is_active)
    VALUES (uid,'pf','Visa','0000',1000,1,10,a_pay,false,true)
    RETURNING id INTO cc;
  INSERT INTO public.credit_card_invoices(credit_card_id, user_id, reference_month,
                                          period_start, closing_date, due_date)
    VALUES (cc, uid, date_trunc('month', current_date)::date,
            date_trunc('month', current_date)::date,
            (date_trunc('month', current_date) + interval '20 days')::date,
            (date_trunc('month', current_date) + interval '30 days')::date)
    RETURNING id INTO inv;

  res := public.delete_account(a_empty);
  IF res <> 'hard' THEN
    RAISE EXCEPTION 'regressao: esperava hard delete, obtive %', res;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.accounts WHERE id = a_empty) INTO still_exists;
  IF still_exists THEN
    RAISE EXCEPTION 'regressao: conta % ainda existe apos hard delete', a_empty;
  END IF;

  UPDATE public.credit_cards SET default_payment_account_id = a_guard WHERE id = cc;
  BEGIN
    PERFORM public.delete_account(a_guard);
  EXCEPTION WHEN check_violation THEN
    guarded := true;
  END;
  IF NOT guarded THEN
    RAISE EXCEPTION 'regressao: trigger nao barrou hard delete de conta ligada a cartao';
  END IF;

  DELETE FROM public.credit_card_invoices WHERE id = inv;
  DELETE FROM public.credit_cards WHERE id = cc;
  DELETE FROM public.accounts WHERE id IN (a_pay, a_guard);

  RETURN jsonb_build_object('ok', true, 'hard_delete_result', res, 'guard_triggered', guarded);
END $function$;

-- 3) Permissoes: somente service_role em TODAS as rotinas de QA.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE '\_e2e\_%' OR p.proname LIKE '\_test\_%'
           OR p.proname = '_assert_test_helper_allowed')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
