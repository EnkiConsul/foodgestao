-- Assinatura de cortesia do módulo Pessoas para donos que já usam o módulo DP
INSERT INTO public.subscriptions (
  user_id, company_id, module, plan_id, status,
  is_exempt, exempt_reason, exempted_at,
  billing_variant, started_at, current_period_start, current_period_end
)
SELECT DISTINCT ON (cmb.user_id)
  cmb.user_id,
  c.id,
  'pessoas',
  (SELECT id FROM public.plans WHERE slug = 'pessoas-multiempresa'),
  'active'::subscription_status,
  true,
  'Cliente da base anterior — isento até a migração para planos pagos',
  now(),
  'monthly_flex',
  now(),
  now(),
  now() + interval '1 month'
FROM public.company_modules cm
JOIN public.companies c ON c.id = cm.company_id
JOIN public.company_members cmb ON cmb.company_id = c.id AND cmb.role = 'owner'
WHERE cm.module = 'dp'
  AND cm.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = cmb.user_id AND s.module = 'pessoas'
  )
ORDER BY cmb.user_id, c.created_at;
