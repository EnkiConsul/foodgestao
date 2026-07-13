
-- =========================================================
-- 1) Meta dos grupos raiz do plano de contas
-- =========================================================
CREATE TABLE IF NOT EXISTS public.chart_accounts_root_meta (
  root_code   text PRIMARY KEY,
  label       text NOT NULL,
  nature      text NOT NULL CHECK (nature IN ('ativo','passivo','patrimonio_liquido','receita','custo','despesa_operacional','despesa_financeira','imposto','controle')),
  dre_sign    smallint NOT NULL DEFAULT 0,       -- +1, -1 ou 0
  in_dre      boolean  NOT NULL DEFAULT false,
  in_balance  boolean  NOT NULL DEFAULT false,
  sort_order  integer  NOT NULL DEFAULT 0
);

GRANT SELECT ON public.chart_accounts_root_meta TO authenticated, anon;
GRANT ALL    ON public.chart_accounts_root_meta TO service_role;

ALTER TABLE public.chart_accounts_root_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "root_meta_read_all" ON public.chart_accounts_root_meta;
CREATE POLICY "root_meta_read_all" ON public.chart_accounts_root_meta FOR SELECT USING (true);

INSERT INTO public.chart_accounts_root_meta (root_code, label, nature, dre_sign, in_dre, in_balance, sort_order) VALUES
  ('1','ATIVO',                       'ativo',               0, false, true,  1),
  ('2','PASSIVO',                     'passivo',             0, false, true,  2),
  ('3','PATRIMÔNIO LÍQUIDO',          'patrimonio_liquido',  0, false, true,  3),
  ('4','RECEITAS',                    'receita',            +1, true,  false, 4),
  ('5','CUSTOS',                      'custo',              -1, true,  false, 5),
  ('6','DESPESAS OPERACIONAIS',       'despesa_operacional',-1, true,  false, 6),
  ('7','DESPESAS FINANCEIRAS',        'despesa_financeira', -1, true,  false, 7),
  ('8','IMPOSTOS E TRIBUTOS',         'imposto',            -1, true,  false, 8),
  ('9','CONTAS DE CONTROLE',          'controle',            0, false, false, 9)
ON CONFLICT (root_code) DO UPDATE
  SET label = EXCLUDED.label,
      nature = EXCLUDED.nature,
      dre_sign = EXCLUDED.dre_sign,
      in_dre = EXCLUDED.in_dre,
      in_balance = EXCLUDED.in_balance,
      sort_order = EXCLUDED.sort_order;

-- =========================================================
-- 2) Índice auxiliar
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_transactions_company_category
  ON public.transactions(company_id, category_id)
  WHERE category_id IS NOT NULL;

-- =========================================================
-- 3) RPC principal: relatório recursivo
-- =========================================================
CREATE OR REPLACE FUNCTION public.chart_accounts_report(
  _context           context_type,
  _company_id        uuid          DEFAULT NULL,
  _from              date          DEFAULT NULL,
  _to                date          DEFAULT NULL,
  _regime            text          DEFAULT 'competencia',
  _cost_center_ids   uuid[]        DEFAULT NULL,
  _include_zero      boolean       DEFAULT false
)
RETURNS TABLE(
  id                 uuid,
  parent_id          uuid,
  code               text,
  name               text,
  level              integer,
  is_analytic        boolean,
  is_active          boolean,
  root_code          text,
  nature             text,
  dre_sign           smallint,
  in_dre             boolean,
  in_balance         boolean,
  debitos            numeric,
  creditos           numeric,
  saldo_proprio      numeric,
  saldo_consolidado  numeric,
  has_movement       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid   uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;

  IF _context = 'pj' THEN
    IF _company_id IS NULL THEN RAISE EXCEPTION 'company_id obrigatório em PJ' USING ERRCODE = '22023'; END IF;
    IF NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
    SELECT c.user_id INTO _owner FROM public.companies c WHERE c.id = _company_id;
  ELSE
    _owner := _uid;
  END IF;

  RETURN QUERY
  WITH accs AS (
    SELECT a.id, a.parent_id, a.code, a.name, a.is_active, a.allow_transactions,
           split_part(a.code, '.', 1) AS root_code,
           array_length(string_to_array(a.code, '.'), 1) AS level
    FROM public.chart_accounts a
    WHERE a.user_id = _owner
      AND a.context = _context
      AND a.code IS NOT NULL
      AND (
        _context = 'pf'
        OR EXISTS (
          SELECT 1 FROM public.chart_account_companies cc
          WHERE cc.chart_account_id = a.id AND cc.company_id = _company_id
        )
      )
  ),
  txs AS (
    SELECT cat.chart_account_id AS account_id,
           t.transaction_type,
           CASE WHEN _regime = 'caixa'
                THEN COALESCE(NULLIF(t.amount_paid, 0), t.amount)
                ELSE t.amount
           END AS valor
    FROM public.transactions t
    JOIN public.categories cat ON cat.id = t.category_id
    WHERE t.user_id = _owner
      AND t.context = _context
      AND t.status <> 'cancelado'
      AND t.transaction_type IN ('receita','despesa')
      AND cat.chart_account_id IS NOT NULL
      AND (_context = 'pf' OR t.company_id = _company_id)
      AND (_cost_center_ids IS NULL OR t.cost_center_id = ANY(_cost_center_ids))
      AND (
        (_regime = 'caixa'       AND (_from IS NULL OR t.payment_date >= _from) AND (_to IS NULL OR t.payment_date <= _to))
        OR
        (_regime = 'competencia' AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
                                 AND (_to   IS NULL OR COALESCE(t.due_date, t.transaction_date) <= _to))
      )
  ),
  mov AS (
    SELECT account_id,
           SUM(CASE WHEN transaction_type = 'receita' THEN valor ELSE 0 END)::numeric AS creditos,
           SUM(CASE WHEN transaction_type = 'despesa' THEN valor ELSE 0 END)::numeric AS debitos,
           SUM(CASE WHEN transaction_type = 'receita' THEN valor
                    WHEN transaction_type = 'despesa' THEN -valor
                    ELSE 0 END)::numeric AS saldo_proprio
    FROM txs
    GROUP BY account_id
  )
  SELECT
    a.id,
    a.parent_id,
    a.code,
    a.name,
    a.level,
    a.allow_transactions AS is_analytic,
    a.is_active,
    a.root_code,
    m.nature,
    m.dre_sign,
    m.in_dre,
    m.in_balance,
    COALESCE(mv.debitos, 0)          AS debitos,
    COALESCE(mv.creditos, 0)         AS creditos,
    COALESCE(mv.saldo_proprio, 0)    AS saldo_proprio,
    COALESCE((
      SELECT SUM(mv2.saldo_proprio)
      FROM accs d
      JOIN mov  mv2 ON mv2.account_id = d.id
      WHERE d.code = a.code OR d.code LIKE a.code || '.%'
    ), 0)                             AS saldo_consolidado,
    EXISTS (
      SELECT 1 FROM accs d
      JOIN mov mv3 ON mv3.account_id = d.id
      WHERE d.code = a.code OR d.code LIKE a.code || '.%'
    )                                 AS has_movement
  FROM accs a
  LEFT JOIN public.chart_accounts_root_meta m ON m.root_code = a.root_code
  LEFT JOIN mov mv ON mv.account_id = a.id
  WHERE _include_zero
     OR EXISTS (
       SELECT 1 FROM accs d
       JOIN mov mvX ON mvX.account_id = d.id
       WHERE d.code = a.code OR d.code LIKE a.code || '.%'
     )
  ORDER BY a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_report(context_type, uuid, date, date, text, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_report(context_type, uuid, date, date, text, uuid[], boolean) TO authenticated;

-- =========================================================
-- 4) Razão (extrato) por conta
-- =========================================================
CREATE OR REPLACE FUNCTION public.chart_accounts_ledger(
  _context     context_type,
  _company_id  uuid,
  _account_id  uuid,
  _from        date DEFAULT NULL,
  _to          date DEFAULT NULL,
  _regime      text DEFAULT 'competencia'
)
RETURNS TABLE(
  transaction_id     uuid,
  data               date,
  descricao          text,
  categoria          text,
  contato            text,
  origem             text,
  valor              numeric,
  sinal              smallint,
  saldo_acumulado    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
    SELECT c.user_id INTO _owner FROM public.companies c WHERE c.id = _company_id;
  ELSE
    _owner := _uid;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT t.id,
           CASE WHEN _regime = 'caixa' THEN t.payment_date
                ELSE COALESCE(t.due_date, t.transaction_date) END AS data,
           t.description,
           cat.name AS categoria,
           co.name  AS contato,
           t.provider AS origem,
           CASE WHEN _regime = 'caixa'
                THEN COALESCE(NULLIF(t.amount_paid, 0), t.amount)
                ELSE t.amount END AS valor,
           (CASE WHEN t.transaction_type = 'receita' THEN 1
                 WHEN t.transaction_type = 'despesa' THEN -1
                 ELSE 0 END)::smallint AS sinal
    FROM public.transactions t
    JOIN public.categories cat ON cat.id = t.category_id
    LEFT JOIN public.contacts co ON co.id = t.contact_id
    WHERE t.user_id = _owner
      AND t.context = _context
      AND cat.chart_account_id = _account_id
      AND t.status <> 'cancelado'
      AND t.transaction_type IN ('receita','despesa')
      AND (_context = 'pf' OR t.company_id = _company_id)
      AND (
        (_regime = 'caixa'       AND (_from IS NULL OR t.payment_date >= _from) AND (_to IS NULL OR t.payment_date <= _to))
        OR
        (_regime = 'competencia' AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
                                 AND (_to   IS NULL OR COALESCE(t.due_date, t.transaction_date) <= _to))
      )
  )
  SELECT b.id, b.data, b.description, b.categoria, b.contato, b.origem, b.valor, b.sinal,
         SUM(b.valor * b.sinal) OVER (ORDER BY b.data, b.id
                                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric
  FROM base b
  ORDER BY b.data, b.id;
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_ledger(context_type, uuid, uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_ledger(context_type, uuid, uuid, date, date, text) TO authenticated;

-- =========================================================
-- 5) Pendências de classificação (grupo 9 + sem conta)
-- =========================================================
CREATE OR REPLACE FUNCTION public.chart_accounts_pending_classification(
  _context     context_type,
  _company_id  uuid DEFAULT NULL,
  _from        date DEFAULT NULL,
  _to          date DEFAULT NULL,
  _limit       integer DEFAULT 200
)
RETURNS TABLE(
  transaction_id uuid,
  data date,
  descricao text,
  valor numeric,
  transaction_type transaction_type,
  motivo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _context = 'pj' THEN
    IF _company_id IS NULL OR NOT private.is_company_member(_uid, _company_id) THEN
      RAISE EXCEPTION 'Not a company member' USING ERRCODE = '42501';
    END IF;
    SELECT c.user_id INTO _owner FROM public.companies c WHERE c.id = _company_id;
  ELSE
    _owner := _uid;
  END IF;

  RETURN QUERY
  SELECT t.id,
         COALESCE(t.due_date, t.transaction_date),
         t.description,
         t.amount,
         t.transaction_type,
         CASE
           WHEN t.category_id IS NULL THEN 'Sem categoria'
           WHEN cat.chart_account_id IS NULL THEN 'Categoria sem conta contábil'
           WHEN split_part(a.code, '.', 1) = '9' THEN 'Conta de controle (grupo 9)'
           ELSE 'Pendente'
         END
  FROM public.transactions t
  LEFT JOIN public.categories cat ON cat.id = t.category_id
  LEFT JOIN public.chart_accounts a ON a.id = cat.chart_account_id
  WHERE t.user_id = _owner
    AND t.context = _context
    AND t.status <> 'cancelado'
    AND t.transaction_type IN ('receita','despesa')
    AND (_context = 'pf' OR t.company_id = _company_id)
    AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
    AND (_to   IS NULL OR COALESCE(t.due_date, t.transaction_date) <= _to)
    AND (
      t.category_id IS NULL
      OR cat.chart_account_id IS NULL
      OR split_part(a.code, '.', 1) = '9'
    )
  ORDER BY COALESCE(t.due_date, t.transaction_date) DESC
  LIMIT GREATEST(_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.chart_accounts_pending_classification(context_type, uuid, date, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_pending_classification(context_type, uuid, date, date, integer) TO authenticated;
