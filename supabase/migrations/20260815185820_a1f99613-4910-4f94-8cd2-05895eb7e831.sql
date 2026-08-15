-- DRE Gerencial: filtro de situação (Pagos / A Pagar-Receber / Todos)
CREATE OR REPLACE FUNCTION public.chart_accounts_report(
  _context context_type,
  _company_id uuid DEFAULT NULL::uuid,
  _from date DEFAULT NULL::date,
  _to date DEFAULT NULL::date,
  _regime text DEFAULT 'competencia'::text,
  _cost_center_ids uuid[] DEFAULT NULL::uuid[],
  _include_zero boolean DEFAULT false,
  _status text DEFAULT 'pago'
)
 RETURNS TABLE(id uuid, parent_id uuid, code text, name text, level integer, is_analytic boolean, is_active boolean, root_code text, nature text, dre_sign smallint, in_dre boolean, in_balance boolean, debitos numeric, creditos numeric, saldo_proprio numeric, saldo_consolidado numeric, has_movement boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid   uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;
  _status := COALESCE(NULLIF(_status, ''), 'pago');
  IF _status NOT IN ('pago','pendente','todos') THEN
    RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023';
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
    -- Realizado (pago/recebido)
    SELECT cat.chart_account_id AS account_id,
           t.transaction_type,
           CASE WHEN _regime = 'caixa' THEN COALESCE(t.amount_paid, 0) ELSE t.amount END AS valor
    FROM public.transactions t
    JOIN public.categories cat ON cat.id = t.category_id
    WHERE _status IN ('pago','todos')
      AND t.user_id = _owner
      AND t.context = _context
      AND t.status <> 'cancelado'
      AND t.transaction_type IN ('entrada','saida')
      AND cat.chart_account_id IS NOT NULL
      AND (_context = 'pf' OR t.company_id = _company_id)
      AND (_cost_center_ids IS NULL OR t.cost_center_id = ANY(_cost_center_ids))
      AND (
        (_regime = 'caixa'       AND t.payment_date IS NOT NULL
                                 AND COALESCE(t.amount_paid, 0) <> 0
                                 AND (_from IS NULL OR t.payment_date >= _from)
                                 AND (_to IS NULL OR t.payment_date <= _to))
        OR
        (_regime = 'competencia' AND t.payment_date IS NOT NULL
                                 AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
                                 AND (_to   IS NULL OR COALESCE(t.due_date, t.transaction_date) <= _to))
      )

    UNION ALL

    -- Em aberto (a pagar / a receber): saldo devedor pela data de vencimento
    SELECT cat.chart_account_id AS account_id,
           t.transaction_type,
           (t.amount - COALESCE(t.amount_paid, 0)) AS valor
    FROM public.transactions t
    JOIN public.categories cat ON cat.id = t.category_id
    WHERE _status IN ('pendente','todos')
      AND t.user_id = _owner
      AND t.context = _context
      AND t.status NOT IN ('cancelado','pago')
      AND t.transaction_type IN ('entrada','saida')
      AND cat.chart_account_id IS NOT NULL
      AND (t.amount - COALESCE(t.amount_paid, 0)) > 0
      AND (_context = 'pf' OR t.company_id = _company_id)
      AND (_cost_center_ids IS NULL OR t.cost_center_id = ANY(_cost_center_ids))
      AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
      AND (_to   IS NULL OR COALESCE(t.due_date, t.transaction_date) <= _to)
  ),
  mov AS (
    SELECT account_id,
           SUM(CASE WHEN transaction_type = 'entrada' THEN valor ELSE 0 END)::numeric AS creditos,
           SUM(CASE WHEN transaction_type = 'saida' THEN valor ELSE 0 END)::numeric AS debitos,
           SUM(CASE WHEN transaction_type = 'entrada' THEN valor
                    WHEN transaction_type = 'saida' THEN -valor
                    ELSE 0 END)::numeric AS saldo_proprio
    FROM txs
    GROUP BY account_id
  )
  SELECT
    a.id, a.parent_id, a.code, a.name, a.level,
    a.allow_transactions AS is_analytic,
    a.is_active, a.root_code,
    m.nature, m.dre_sign, m.in_dre, m.in_balance,
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
$function$;

REVOKE ALL ON FUNCTION public.chart_accounts_report(context_type, uuid, date, date, text, uuid[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_report(context_type, uuid, date, date, text, uuid[], boolean, text) TO authenticated;

-- Razão: mesmo filtro de situação para o drilldown
CREATE OR REPLACE FUNCTION public.chart_accounts_ledger(
  _context     context_type,
  _company_id  uuid,
  _account_id  uuid,
  _from        date DEFAULT NULL,
  _to          date DEFAULT NULL,
  _regime      text DEFAULT 'competencia',
  _status      text DEFAULT 'pago'
)
RETURNS TABLE(
  transaction_id uuid, data date, descricao text, categoria text, contato text,
  origem text, valor numeric, sinal smallint, saldo_acumulado numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _regime NOT IN ('caixa','competencia') THEN
    RAISE EXCEPTION 'Regime inválido' USING ERRCODE = '22023';
  END IF;
  _status := COALESCE(NULLIF(_status, ''), 'pago');
  IF _status NOT IN ('pago','pendente','todos') THEN
    RAISE EXCEPTION 'Situação inválida' USING ERRCODE = '22023';
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
           CASE WHEN _regime = 'caixa' AND t.payment_date IS NOT NULL THEN t.payment_date
                ELSE COALESCE(t.due_date, t.transaction_date) END AS data,
           t.description,
           cat.name AS categoria,
           co.name  AS contato,
           t.provider AS origem,
           CASE
             WHEN t.payment_date IS NOT NULL AND COALESCE(t.amount_paid,0) <> 0 AND _regime = 'caixa'
               THEN COALESCE(t.amount_paid, 0)
             WHEN t.payment_date IS NULL
               THEN (t.amount - COALESCE(t.amount_paid, 0))
             ELSE t.amount
           END AS valor,
           (CASE WHEN t.transaction_type = 'entrada' THEN 1
                 WHEN t.transaction_type = 'saida' THEN -1
                 ELSE 0 END)::smallint AS sinal
    FROM public.transactions t
    JOIN public.categories cat ON cat.id = t.category_id
    LEFT JOIN public.contacts co ON co.id = t.contact_id
    WHERE t.user_id = _owner
      AND t.context = _context
      AND cat.chart_account_id = _account_id
      AND t.status <> 'cancelado'
      AND t.transaction_type IN ('entrada','saida')
      AND (_context = 'pf' OR t.company_id = _company_id)
      AND (
        (_status = 'pago'     AND t.payment_date IS NOT NULL)
        OR (_status = 'pendente' AND t.payment_date IS NULL
                                 AND t.status <> 'pago'
                                 AND (t.amount - COALESCE(t.amount_paid,0)) > 0)
        OR (_status = 'todos')
      )
      AND (
        (t.payment_date IS NOT NULL AND _regime = 'caixa'
            AND (_from IS NULL OR t.payment_date >= _from)
            AND (_to   IS NULL OR t.payment_date <= _to))
        OR
        ((t.payment_date IS NULL OR _regime = 'competencia')
            AND (_from IS NULL OR COALESCE(t.due_date, t.transaction_date) >= _from)
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

REVOKE ALL ON FUNCTION public.chart_accounts_ledger(context_type, uuid, uuid, date, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.chart_accounts_ledger(context_type, uuid, uuid, date, date, text, text) TO authenticated;