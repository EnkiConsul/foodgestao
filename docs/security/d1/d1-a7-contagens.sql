-- ============================================================================
-- Achado A7 — contagens agregadas executadas em PRODUÇÃO em 21/09/2026.
-- Somente SELECT count(*): nenhum identificador, nome, descrição ou valor é lido.
-- Nenhum comando de escrita, nenhum comando destrutivo.
-- Resultados registrados em docs/security/d1-achado-a7-conta-do-lancamento.md.
-- ============================================================================

SELECT 'tx_total' AS k, count(*) AS v FROM public.transactions
UNION ALL SELECT 'tx_account_null', count(*) FROM public.transactions
  WHERE account_id IS NULL
UNION ALL SELECT 'tx_cartao_null', count(*) FROM public.transactions
  WHERE credit_card_id IS NULL
UNION ALL SELECT 'tx_contexto_pj', count(*) FROM public.transactions
  WHERE context = 'pj'
UNION ALL SELECT 'tx_contexto_nao_pj', count(*) FROM public.transactions
  WHERE context IS DISTINCT FROM 'pj'
-- conta de outra empresa (contexto empresarial)
UNION ALL SELECT 'conta_divergente_pj', count(*)
  FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
 WHERE t.context = 'pj' AND t.company_id IS DISTINCT FROM a.company_id
-- conta de outro usuário / conta empresarial em lançamento pessoal
UNION ALL SELECT 'conta_divergente_nao_pj', count(*)
  FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
 WHERE t.context IS DISTINCT FROM 'pj' AND a.user_id IS DISTINCT FROM t.user_id
UNION ALL SELECT 'conta_pessoal_com_empresa', count(*)
  FROM public.transactions t JOIN public.accounts a ON a.id = t.account_id
 WHERE t.context IS DISTINCT FROM 'pj' AND a.company_id IS NOT NULL
-- cartão de outra empresa / de outro usuário
UNION ALL SELECT 'cartao_divergente_pj', count(*)
  FROM public.transactions t JOIN public.credit_cards c ON c.id = t.credit_card_id
 WHERE t.context = 'pj' AND t.company_id IS DISTINCT FROM c.company_id
UNION ALL SELECT 'cartao_divergente_nao_pj', count(*)
  FROM public.transactions t JOIN public.credit_cards c ON c.id = t.credit_card_id
 WHERE t.context IS DISTINCT FROM 'pj' AND c.user_id IS DISTINCT FROM t.user_id
-- demais referências de tenant
UNION ALL SELECT 'dest_divergente_pj', count(*)
  FROM public.transactions t JOIN public.accounts a ON a.id = t.destination_account_id
 WHERE t.context = 'pj' AND t.company_id IS DISTINCT FROM a.company_id
UNION ALL SELECT 'categoria_divergente_pj', count(*)
  FROM public.transactions t JOIN public.categories g ON g.id = t.category_id
 WHERE t.context = 'pj' AND g.company_id IS NOT NULL
   AND t.company_id IS DISTINCT FROM g.company_id
UNION ALL SELECT 'contato_divergente_pj', count(*)
  FROM public.transactions t JOIN public.contacts ct ON ct.id = t.contact_id
 WHERE t.context = 'pj' AND ct.user_id IS DISTINCT FROM t.user_id
ORDER BY 1;

-- public.cost_centers não possui coluna company_id (escopo por usuário):
-- a divergência por centro de custo não se aplica neste formato.
