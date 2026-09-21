-- ============================================================================
-- D1 — Teste controlado de isolamento multiempresa
-- AMBIENTE: SOMENTE HOMOLOGAÇÃO. NÃO EXECUTAR EM PRODUÇÃO.
-- Etapa D1 é somente leitura: este arquivo é o roteiro preparado, não executado.
--
-- Tudo roda em uma transação encerrada com ROLLBACK; nenhum usuário de auth é
-- criado (as sessões são simuladas por request.jwt.claims, como nos testes RLS
-- já existentes em src/test/rls/). Valores são fictícios.
--
-- Uso (homologação): psql -f d1-teste-isolamento-homologacao.sql
-- Cada teste imprime PASS/FAIL. Qualquer FAIL é achado de isolamento.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Identificadores fictícios e sessão simulada
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE d1_ids(k text primary key, v uuid);
INSERT INTO d1_ids(k, v) VALUES
  ('empresa_a', '00000000-0000-4000-8000-0000000000a1'),
  ('empresa_b', '00000000-0000-4000-8000-0000000000b1'),
  ('user_a',    '00000000-0000-4000-8000-0000000000a2'),  -- dono da empresa A
  ('user_b',    '00000000-0000-4000-8000-0000000000b2'),  -- dono da empresa B
  ('user_sem',  '00000000-0000-4000-8000-0000000000c2');  -- logado, sem vínculo

CREATE OR REPLACE FUNCTION pg_temp.sessao(_uid uuid, _role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('role', _role)::text, true);
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', _role)::text, true);
  END IF;
  PERFORM set_config('role', _role, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.check(_nome text, _ok boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RAISE NOTICE '%: %', CASE WHEN _ok THEN 'PASS' ELSE 'FAIL' END, _nome;
END $$;

-- Espera que o comando falhe (permissão/RLS). Retorna true se falhou.
CREATE OR REPLACE FUNCTION pg_temp.deve_falhar(_sql text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE _sql;
  RETURN false;   -- executou: isolamento furado
EXCEPTION WHEN others THEN
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Fixtures (service_role): duas empresas, dois donos, dados mínimos
-- ---------------------------------------------------------------------------
SET LOCAL role TO service_role;

INSERT INTO public.companies(id, user_id, name, trade_name)
SELECT (SELECT v FROM d1_ids WHERE k='empresa_a'), (SELECT v FROM d1_ids WHERE k='user_a'),
       'EMPRESA TESTE A', 'EMPRESA TESTE A';
INSERT INTO public.companies(id, user_id, name, trade_name)
SELECT (SELECT v FROM d1_ids WHERE k='empresa_b'), (SELECT v FROM d1_ids WHERE k='user_b'),
       'EMPRESA TESTE B', 'EMPRESA TESTE B';
-- company_members é preenchido pelo trigger a_auto_add_company_owner.

INSERT INTO public.accounts(id, user_id, company_id, name, type)
SELECT gen_random_uuid(), (SELECT v FROM d1_ids WHERE k='user_a'),
       (SELECT v FROM d1_ids WHERE k='empresa_a'), 'CONTA A', 'corrente';
INSERT INTO public.accounts(id, user_id, company_id, name, type)
SELECT gen_random_uuid(), (SELECT v FROM d1_ids WHERE k='user_b'),
       (SELECT v FROM d1_ids WHERE k='empresa_b'), 'CONTA B', 'corrente';

INSERT INTO public.transactions(id, user_id, company_id, account_id, description, amount, type, due_date)
SELECT gen_random_uuid(), (SELECT v FROM d1_ids WHERE k='user_a'),
       (SELECT v FROM d1_ids WHERE k='empresa_a'),
       (SELECT id FROM public.accounts WHERE company_id=(SELECT v FROM d1_ids WHERE k='empresa_a') LIMIT 1),
       'LANCAMENTO A', 10, 'despesa', current_date;
INSERT INTO public.transactions(id, user_id, company_id, account_id, description, amount, type, due_date)
SELECT gen_random_uuid(), (SELECT v FROM d1_ids WHERE k='user_b'),
       (SELECT v FROM d1_ids WHERE k='empresa_b'),
       (SELECT id FROM public.accounts WHERE company_id=(SELECT v FROM d1_ids WHERE k='empresa_b') LIMIT 1),
       'LANCAMENTO B', 20, 'despesa', current_date;

-- ---------------------------------------------------------------------------
-- 2) Positivos: o usuário A vê e altera o que é da empresa A
-- ---------------------------------------------------------------------------
PERFORM pg_temp.sessao((SELECT v FROM d1_ids WHERE k='user_a'));

SELECT pg_temp.check('A lê a própria empresa',
  (SELECT count(*) FROM public.companies WHERE id=(SELECT v FROM d1_ids WHERE k='empresa_a'))=1);
SELECT pg_temp.check('A lê contas e lançamentos próprios',
  (SELECT count(*) FROM public.accounts)=1 AND (SELECT count(*) FROM public.transactions)=1);
SELECT pg_temp.check('A edita lançamento próprio',
  NOT pg_temp.deve_falhar($$UPDATE public.transactions SET description='LANCAMENTO A EDITADO'$$));

-- ---------------------------------------------------------------------------
-- 3) Negativos cruzados: A não alcança nada da empresa B
-- ---------------------------------------------------------------------------
SELECT pg_temp.check('A não lê empresa B',
  (SELECT count(*) FROM public.companies WHERE id=(SELECT v FROM d1_ids WHERE k='empresa_b'))=0);
SELECT pg_temp.check('A não lê contas/lançamentos de B',
  (SELECT count(*) FROM public.accounts WHERE company_id=(SELECT v FROM d1_ids WHERE k='empresa_b'))=0);
SELECT pg_temp.check('UPDATE cruzado não afeta linha de B',
  (SELECT count(*) FROM (
     WITH u AS (UPDATE public.transactions SET amount=999
                WHERE company_id=(SELECT v FROM d1_ids WHERE k='empresa_b') RETURNING 1) SELECT * FROM u) x)=0);
SELECT pg_temp.check('DELETE cruzado não remove linha de B',
  (SELECT count(*) FROM (
     WITH d AS (DELETE FROM public.transactions
                WHERE company_id=(SELECT v FROM d1_ids WHERE k='empresa_b') RETURNING 1) SELECT * FROM d) x)=0);
SELECT pg_temp.check('INSERT em nome de B é recusado',
  pg_temp.deve_falhar(format($$INSERT INTO public.transactions
     (user_id, company_id, description, amount, type, due_date)
     VALUES (%L, %L, 'INTRUSO', 1, 'despesa', current_date)$$,
     (SELECT v FROM d1_ids WHERE k='user_a'), (SELECT v FROM d1_ids WHERE k='empresa_b'))));

-- ---------------------------------------------------------------------------
-- 4) Reatribuição de tenant e FK cruzada
-- ---------------------------------------------------------------------------
SELECT pg_temp.check('mover lançamento próprio para empresa B é recusado',
  pg_temp.deve_falhar(format($$UPDATE public.transactions SET company_id=%L
     WHERE company_id=%L$$,
     (SELECT v FROM d1_ids WHERE k='empresa_b'), (SELECT v FROM d1_ids WHERE k='empresa_a'))));
SELECT pg_temp.check('lançamento da empresa A apontando para conta da empresa B é recusado',
  pg_temp.deve_falhar(format($$INSERT INTO public.transactions
     (user_id, company_id, account_id, description, amount, type, due_date)
     VALUES (%L, %L, (SELECT id FROM public.accounts WHERE name='CONTA B'), 'FK CRUZADA', 1, 'despesa', current_date)$$,
     (SELECT v FROM d1_ids WHERE k='user_a'), (SELECT v FROM d1_ids WHERE k='empresa_a'))));

-- ---------------------------------------------------------------------------
-- 5) RPCs e views
-- ---------------------------------------------------------------------------
SELECT pg_temp.check('get_accessible_accounts recusa empresa alheia',
  pg_temp.deve_falhar(format($$SELECT * FROM public.get_accessible_accounts('pj', %L, false)$$,
    (SELECT v FROM d1_ids WHERE k='empresa_b'))));
SELECT pg_temp.check('get_accessible_categories recusa empresa alheia',
  pg_temp.deve_falhar(format($$SELECT * FROM public.get_accessible_categories('pj', %L, NULL)$$,
    (SELECT v FROM d1_ids WHERE k='empresa_b'))));
SELECT pg_temp.check('company_member_profiles não expõe perfis de B',
  (SELECT count(*) FROM public.company_member_profiles
    WHERE user_id=(SELECT v FROM d1_ids WHERE k='user_b'))=0);
-- Achado A1/A2: enquanto não corrigidos, estes DEVEM falhar (retornar linhas de B).
SELECT pg_temp.check('A1 dp_admissao_regras_resolver não devolve regra de empresa alheia',
  (SELECT count(*) FROM public.dp_admissao_regras_resolver(
      (SELECT v FROM d1_ids WHERE k='empresa_b'), NULL, NULL, NULL))=0);
SELECT pg_temp.check('A2 dp_config_resolvida não devolve configuração de empresa alheia',
  (SELECT count(*) FROM public.dp_config_resolvida(
      (SELECT v FROM d1_ids WHERE k='empresa_b'), NULL))=0);
SELECT pg_temp.check('A4 helper private não revela vínculo de outro usuário',
  pg_temp.deve_falhar(format($$SELECT private.pluggy_can_edit(%L, %L)$$,
    (SELECT v FROM d1_ids WHERE k='user_b'), (SELECT v FROM d1_ids WHERE k='empresa_b'))));

-- ---------------------------------------------------------------------------
-- 6) Usuário logado sem vínculo e visitante anônimo
-- ---------------------------------------------------------------------------
PERFORM pg_temp.sessao((SELECT v FROM d1_ids WHERE k='user_sem'));
SELECT pg_temp.check('usuário sem vínculo não vê empresa alguma',
  (SELECT count(*) FROM public.companies)=0
  AND (SELECT count(*) FROM public.accounts)=0
  AND (SELECT count(*) FROM public.transactions)=0);
SELECT pg_temp.check('usuário sem vínculo não insere em empresa alheia',
  pg_temp.deve_falhar(format($$INSERT INTO public.accounts (user_id, company_id, name, type)
     VALUES (%L, %L, 'INTRUSA', 'corrente')$$,
     (SELECT v FROM d1_ids WHERE k='user_sem'), (SELECT v FROM d1_ids WHERE k='empresa_a'))));

PERFORM pg_temp.sessao(NULL, 'anon');
SELECT pg_temp.check('anon não lê tabelas financeiras',
  (SELECT count(*) FROM public.companies)=0
  AND (SELECT count(*) FROM public.accounts)=0
  AND (SELECT count(*) FROM public.transactions)=0
  AND (SELECT count(*) FROM public.profiles)=0);
SELECT pg_temp.check('anon não escreve em profiles/companies',
  pg_temp.deve_falhar($$INSERT INTO public.profiles(user_id, full_name) VALUES (gen_random_uuid(),'X')$$)
  AND pg_temp.deve_falhar($$UPDATE public.companies SET name='X'$$));
-- Achado A3: enquanto o EXECUTE de anon não for revogado, a chamada existe (deve falhar por sessão).
SELECT pg_temp.check('A3 anon não executa pluggy_clear_pending_staging',
  pg_temp.deve_falhar(format($$SELECT public.pluggy_clear_pending_staging(%L, ARRAY[gen_random_uuid()])$$,
    (SELECT v FROM d1_ids WHERE k='empresa_a'))));

RESET role;
ROLLBACK;
