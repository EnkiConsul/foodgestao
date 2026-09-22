SELECT count(*) AS transactions_checked,
 count(*) FILTER (WHERE t.context IS NULL OR t.user_id IS NULL OR (t.context='pj' AND t.company_id IS NULL) OR (t.context='pf' AND t.company_id IS NOT NULL)) AS invalid_context,
 count(*) FILTER (WHERE t.account_id IS NOT NULL AND (a.id IS NULL OR a.context IS DISTINCT FROM t.context OR a.company_id IS DISTINCT FROM t.company_id OR (t.context='pf' AND a.user_id IS DISTINCT FROM t.user_id))) AS invalid_account,
 count(*) FILTER (WHERE t.credit_card_id IS NOT NULL AND (c.id IS NULL OR c.context IS DISTINCT FROM t.context OR c.company_id IS DISTINCT FROM t.company_id OR (t.context='pf' AND c.user_id IS DISTINCT FROM t.user_id))) AS invalid_card,
 count(*) FILTER (WHERE t.transaction_type='transferencia' AND t.destination_account_id IS NOT NULL AND (d.id IS NULL OR d.context IS DISTINCT FROM t.context OR d.company_id IS DISTINCT FROM t.company_id OR (t.context='pf' AND d.user_id IS DISTINCT FROM t.user_id))) AS invalid_destination,
 has_column_privilege('authenticated','public.accounts','name','UPDATE') AS authenticated_can_update_name
FROM public.transactions t LEFT JOIN public.accounts a ON a.id=t.account_id
LEFT JOIN public.credit_cards c ON c.id=t.credit_card_id LEFT JOIN public.accounts d ON d.id=t.destination_account_id
