-- P0.2-B — Hardening das rotinas de teste/E2E expostas em produção.
--
-- Problema: as rotinas `_e2e_*` e `_test_delete_account_hard_regression` eram
-- executáveis por QUALQUER usuário logado e gravam/apagam dados reais.
--
-- Decisão: manter os nomes e o GRANT para `authenticated` (a suíte E2E chama via
-- token de sessão), mas exigir autorização explícita dentro da própria rotina:
--   * `service_role` (Edge Functions / CI com chave de serviço); ou
--   * usuário com papel `super_admin` em `public.user_roles`.
-- Qualquer outro chamador falha fechado com 42501 (permission denied).
--
-- Idempotente. Nenhum INSERT/UPDATE/DELETE em dados reais.

-- 1) Guarda única e reutilizável.
CREATE OR REPLACE FUNCTION public._assert_test_helper_allowed()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _jwt_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Chamadas internas do banco / chave de serviço.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR _jwt_role = 'service_role' THEN
    RETURN;
  END IF;

  -- QA/E2E autorizado: apenas super_admin.
  IF _uid IS NOT NULL AND public.has_role(_uid, 'super_admin'::app_role) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION
    'permission denied: rotina de teste requer service_role ou papel super_admin'
    USING ERRCODE = '42501';
END $function$;

REVOKE ALL ON FUNCTION public._assert_test_helper_allowed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._assert_test_helper_allowed() TO authenticated, service_role;

-- 2) Rotinas de teste com a guarda como primeira instrução.

CREATE OR REPLACE FUNCTION public._e2e_seed_delete_accounts(_empty_name text, _history_name text)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, company_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cid uuid;
  ctx context_type;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
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

CREATE OR REPLACE FUNCTION public._e2e_cleanup_delete_accounts(_names text[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_names) n WHERE n !~ '^E2E-') THEN
    RAISE EXCEPTION 'names must start with E2E-';
  END IF;
  DELETE FROM public.transactions
   WHERE user_id = uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = uid AND name = ANY(_names));
  DELETE FROM public.accounts WHERE user_id = uid AND name = ANY(_names);
END $function$;

CREATE OR REPLACE FUNCTION public._e2e_seed_foreign_accounts(_empty_name text, _history_name text)
RETURNS TABLE(empty_id uuid, history_id uuid, tx_id uuid, foreign_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  other uuid;
  a_empty uuid; a_hist uuid; t_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
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

CREATE OR REPLACE FUNCTION public._e2e_seed_adjust_balance(_account_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _id  uuid;
  _company_id uuid;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

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

CREATE OR REPLACE FUNCTION public._e2e_cleanup_adjust_balance(_account_name text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  PERFORM set_config('app.balance_engine', 'on', true);
  DELETE FROM public.transactions
   WHERE user_id = _uid
     AND account_id IN (SELECT id FROM public.accounts WHERE user_id = _uid AND name = _account_name);
  DELETE FROM public.accounts WHERE user_id = _uid AND name = _account_name;
  PERFORM set_config('app.balance_engine', '', true);
END $function$;

CREATE OR REPLACE FUNCTION public._test_delete_account_hard_regression()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  a_empty uuid; a_pay uuid; a_guard uuid;
  cc uuid; inv uuid;
  res text;
  guarded boolean := false;
  still_exists boolean;
BEGIN
  PERFORM public._assert_test_helper_allowed();
  IF uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Empty-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_empty;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Pay-'   || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
    RETURNING id INTO a_pay;
  INSERT INTO public.accounts(user_id, name, account_type, context, initial_balance, current_balance, is_active)
    VALUES (uid, 'REG-Guard-' || substr(gen_random_uuid()::text,1,8), 'corrente','pf',0,0,true)
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
    RAISE EXCEPTION 'regressão: esperava hard delete, obtive %', res;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.accounts WHERE id = a_empty) INTO still_exists;
  IF still_exists THEN
    RAISE EXCEPTION 'regressão: conta % ainda existe após hard delete', a_empty;
  END IF;

  UPDATE public.credit_cards SET default_payment_account_id = a_guard WHERE id = cc;
  BEGIN
    PERFORM public.delete_account(a_guard);
  EXCEPTION WHEN check_violation THEN
    guarded := true;
  END;
  IF NOT guarded THEN
    RAISE EXCEPTION 'regressão: trigger não barrou hard delete de conta ligada a cartão';
  END IF;

  DELETE FROM public.credit_card_invoices WHERE id = inv;
  DELETE FROM public.credit_cards WHERE id = cc;
  DELETE FROM public.accounts WHERE id IN (a_pay, a_guard);

  RETURN jsonb_build_object(
    'ok', true,
    'hard_delete_result', res,
    'guard_triggered', guarded
  );
END $function$;

-- 3) Permissões: nunca anon/PUBLIC; authenticated apenas como porta de entrada
--    (a autorização real acontece dentro da guarda).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname LIKE '\_e2e\_%' OR p.proname LIKE '\_test\_%')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Somente as rotinas usadas pela suíte E2E autenticada mantêm authenticated.
GRANT EXECUTE ON FUNCTION public._e2e_seed_delete_accounts(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_delete_accounts(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_seed_foreign_accounts(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_foreign_accounts(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_seed_adjust_balance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._e2e_cleanup_adjust_balance(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._test_delete_account_hard_regression() TO authenticated;

-- _test_balance_engine() e _test_delete_account_authz() seguem sem authenticated
-- (apenas service_role), conforme já aplicado em fases anteriores.
REVOKE ALL ON FUNCTION public._test_balance_engine() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_delete_account_authz() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_balance_engine() TO service_role;
GRANT EXECUTE ON FUNCTION public._test_delete_account_authz() TO service_role;
