CREATE OR REPLACE FUNCTION public.billing_v2_reconciliation()
 RETURNS TABLE(tipo text, subscription_id uuid, company_id uuid, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_excluidas uuid[] := ARRAY[
    '9293cf25-6e33-4bd5-8555-b158165a9590','09d6063b-c05d-4c04-9fb2-4551dbadca7a','00ef8ba0-25a5-4746-b6aa-79f1f0d1b308',
    'ec47f19b-39e4-4c93-a68b-ef111e0dd50c','c1755a13-0258-4c2d-aa63-ff458d2a0f9b','d18aa737-0bf7-4819-af86-5c95541c6602',
    '693aff26-052d-4801-8670-3fea4c0c7a1a','7221ab79-05d5-44eb-ad07-e2b21a99b90b','9aa85e5e-a453-4d66-b785-9fd1af1712cc']::uuid[];
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Apenas o super admin pode rodar a conciliação.';
  END IF;
  RETURN QUERY
  SELECT 'assinatura_sem_conta', s.id, s.company_id, s.status::text FROM subscriptions s WHERE s.billing_account_id IS NULL
  UNION ALL
  SELECT 'empresa_sem_conta', NULL::uuid, c.id, c.name FROM companies c
   WHERE NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.company_id = c.id AND b.removed_at IS NULL)
  UNION ALL
  SELECT 'isencao_sem_concessao', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired') AND s.is_exempt AND (s.exempt_until IS NULL OR s.exempt_until >= now())
     AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'cortesia_total'
                     AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
  UNION ALL
  SELECT 'concessao_sem_isencao', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired')
     AND EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'cortesia_total'
                 AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
     AND NOT (s.is_exempt AND (s.exempt_until IS NULL OR s.exempt_until >= now()))
  UNION ALL
  SELECT 'carencia_sem_concessao', s.id, s.company_id, s.grace_ends_at::text FROM subscriptions s
   WHERE s.status::text = 'grace'
     AND NOT EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia' AND g.revoked_at IS NULL)
  UNION ALL
  SELECT 'empresa_sem_assinatura_na_conta', NULL::uuid, c.id, a.nome FROM companies c
    JOIN billing_account_companies b ON b.company_id = c.id AND b.removed_at IS NULL
    JOIN billing_accounts a ON a.id = b.billing_account_id
   WHERE NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.billing_account_id = a.id AND s.status::text NOT IN ('canceled','expired'))
     AND EXISTS (SELECT 1 FROM subscriptions s2 WHERE s2.user_id = a.titular_user_id AND s2.status::text NOT IN ('canceled','expired')
                   AND s2.billing_account_id IS DISTINCT FROM a.id)
  UNION ALL
  SELECT 'conta_vazia_com_assinatura_ativa', s.id, s.company_id, a.nome FROM subscriptions s
    JOIN billing_accounts a ON a.id = s.billing_account_id
   WHERE s.status::text NOT IN ('canceled','expired') AND s.created_at < now() - interval '30 days'
     AND NOT EXISTS (SELECT 1 FROM billing_account_companies b WHERE b.billing_account_id = a.id AND b.removed_at IS NULL)
  UNION ALL
  SELECT 'carencia_ativa_sem_grace', s.id, s.company_id, s.status::text FROM subscriptions s
   WHERE s.status::text <> 'grace'
     AND EXISTS (SELECT 1 FROM subscription_grants g WHERE g.subscription_id = s.id AND g.tipo = 'carencia'
                 AND g.revoked_at IS NULL AND (g.ends_at IS NULL OR g.ends_at >= now()))
  UNION ALL
  SELECT 'cobertura_excede_franquia', s.id, s.company_id, format('%s empresas cobertas, limite %s', l.uso, l.limite)
    FROM subscriptions s CROSS JOIN LATERAL public._billing_v2_limits(s.id) l
   WHERE s.status::text NOT IN ('canceled','expired') AND l.recurso = 'empresas' AND l.limite IS NOT NULL AND l.uso > l.limite
  UNION ALL
  SELECT 'adicional_proibido_pelo_plano', s.id, s.company_id, format('%s: %s empresas, plano permite %s sem adicional', p.slug, l.uso, l.incluido)
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id CROSS JOIN LATERAL public._billing_v2_limits(s.id) l
   WHERE s.status::text NOT IN ('canceled','expired') AND l.recurso = 'empresas' AND NOT l.permite_adicional
     AND l.override IS NULL AND l.uso > l.incluido
  UNION ALL
  SELECT 'empresa_sem_cobertura_no_modulo', s.id, b.company_id, 'INFORMATIVO: ' || s.module FROM subscriptions s
    JOIN billing_account_companies b ON b.billing_account_id = s.billing_account_id AND b.removed_at IS NULL
   WHERE s.status::text NOT IN ('canceled','expired')
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.company_id = b.company_id AND sc.module = s.module AND sc.removed_at IS NULL)
  UNION ALL
  SELECT 'assinatura_ativa_sem_cobertura', s.id, s.company_id, 'TRAVANTE: assinatura ' || s.module || ' sem nenhuma empresa coberta'
    FROM subscriptions s
   WHERE s.status::text NOT IN ('canceled','expired')
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc WHERE sc.subscription_id = s.id AND sc.removed_at IS NULL)
     AND NOT (s.status::text = 'trialing' AND NOT EXISTS (SELECT 1 FROM billing_account_companies b
              WHERE b.billing_account_id = s.billing_account_id AND b.removed_at IS NULL))
  UNION ALL
  SELECT 'modulo_em_uso_sem_cobertura', NULL::uuid, c.id, 'TRAVANTE: pessoas em uso (' || c.name || ')'
    FROM companies c
   WHERE c.id <> ALL (v_excluidas)
     AND EXISTS (SELECT 1 FROM dp_colaboradores d WHERE d.company_id = c.id AND d.ativo AND d.deleted_at IS NULL AND d.data_desligamento IS NULL)
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc JOIN subscriptions s ON s.id = sc.subscription_id
                     WHERE sc.company_id = c.id AND sc.module = 'pessoas' AND sc.removed_at IS NULL AND s.status::text NOT IN ('canceled','expired'))
  UNION ALL
  SELECT 'modulo_em_uso_sem_cobertura', NULL::uuid, c.id, 'TRAVANTE: financeiro em uso (' || c.name || ')'
    FROM companies c
   WHERE c.id <> ALL (v_excluidas)
     AND (EXISTS (SELECT 1 FROM transactions t WHERE t.company_id = c.id AND t.created_at >= now() - interval '90 days')
          OR EXISTS (SELECT 1 FROM accounts ac WHERE ac.company_id = c.id AND ac.created_at >= now() - interval '90 days'))
     AND NOT EXISTS (SELECT 1 FROM subscription_companies sc JOIN subscriptions s ON s.id = sc.subscription_id
                     WHERE sc.company_id = c.id AND sc.module = 'financeiro' AND sc.removed_at IS NULL AND s.status::text NOT IN ('canceled','expired'))
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'e-mail ' || k FROM (SELECT lower(email) k FROM trial_usage WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CPF ' || k FROM (SELECT documento_titular k FROM trial_usage WHERE documento_titular IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'trial_duplicado', NULL::uuid, NULL::uuid, 'CNPJ ' || k FROM (SELECT cnpj_empresa k FROM trial_usage WHERE cnpj_empresa IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL
  SELECT 'plano_fora_do_catalogo', s.id, s.company_id, p.slug FROM subscriptions s JOIN plans p ON p.id = s.plan_id
   WHERE s.status::text NOT IN ('canceled','expired') AND NOT p.is_active;
END $function$;