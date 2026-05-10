# Backoffice Gestor Plin — Gestão da Plataforma

Expandir o painel `/admin` (apenas `super_admin`) com gestão completa de clientes, planos com limites já aplicados e faturamento/cupons, modelando os dados de forma agnóstica para conectar depois um gateway nacional (Asaas/Iugu/Pagar.me).

## 1. Modelo de dados (migrations)

Novas tabelas em `public`:

- **plans** — `id`, `slug` (free, starter, pro, business), `name`, `description`, `price_cents`, `billing_period` (`monthly`/`yearly`), `trial_days`, `is_active`, `sort_order`, `features` (jsonb com limites: `max_companies`, `max_transactions_per_month`, `max_users_per_company`, `max_attachments_per_transaction`, `ai_enabled`, `reports_advanced`, `export_pdf`, etc).
- **subscriptions** — `id`, `user_id`, `plan_id`, `status` (`trialing`/`active`/`past_due`/`canceled`/`expired`), `started_at`, `current_period_start`, `current_period_end`, `trial_ends_at`, `canceled_at`, `cancel_at_period_end`, `external_subscription_id` (gateway), `external_customer_id`. Único ativo por usuário.
- **invoices** — `id`, `subscription_id`, `user_id`, `amount_cents`, `status` (`draft`/`open`/`paid`/`overdue`/`canceled`/`refunded`), `due_date`, `paid_at`, `period_start`, `period_end`, `payment_method` (`pix`/`boleto`/`card`), `external_invoice_id`, `external_payment_url`, `pix_qrcode`, `boleto_url`.
- **coupons** — `id`, `code` (único), `description`, `discount_type` (`percent`/`fixed`), `discount_value`, `max_redemptions`, `times_redeemed`, `valid_from`, `valid_until`, `applies_to_plan_ids` (uuid[]), `is_active`.
- **coupon_redemptions** — `id`, `coupon_id`, `user_id`, `subscription_id`, `redeemed_at`.
- **usage_counters** — `id`, `user_id`, `period_month` (date), `transactions_created`, `companies_count`, `attachments_count` — atualizado por triggers/edge para enforcement.

Todas com RLS:
- `super_admin` vê/gerencia tudo (via `is_super_admin`).
- Usuário vê apenas a própria assinatura, faturas e usage.
- `coupons`: leitura pública apenas de cupons ativos por código (validação no checkout); admin gerencia.

Trigger em `auth.users` (extensão do `handle_new_user`) cria assinatura `trialing` no plano free/trial padrão.

Função `public.get_user_plan_limits(_user_id)` retorna features do plano ativo (SECURITY DEFINER) — usada pelo enforcement.

## 2. Enforcement de limites no app

- Hook `useCurrentSubscription()` — retorna plano ativo, status, dias restantes de trial, features.
- Hook `usePlanLimit(feature)` — checa contra `usage_counters` e retorna `{ allowed, used, limit, percentage }`.
- Aplicar bloqueios em:
  - Criação de empresa (`Empresas`) → bloqueia se `companies_count >= max_companies`.
  - Criação de lançamento (`TransactionFormDialog`) → bloqueia se ultrapassar `max_transactions_per_month`.
  - Upload de anexo → respeita `max_attachments_per_transaction`.
  - Funcionalidades premium (relatórios avançados, export PDF, IA) → escondidas/bloqueadas conforme feature flag.
- Componente `<UpgradePrompt>` reutilizável (modal com CTA "Fazer upgrade") para quando o limite é atingido.
- Banner global no topo quando: trial < 3 dias, `past_due`, ou `expired` (read-only mode).

## 3. Backoffice — novas abas em `/admin`

Reaproveita `Admin.tsx` adicionando 4 novas tabs ao lado das existentes (Estatísticas, Usuários, Perfis, Auditoria, Resetar):

### a) Aba **Clientes** (substitui/expande "Usuários")
Tabela com busca, filtros (status assinatura, plano, data signup, ativo) e colunas: nome, email, plano atual, status, MRR, signup, último acesso, ações.
Ações por linha: ver detalhes, ativar/suspender, alterar plano manualmente, conceder dias de trial, resetar senha (já existe), excluir.
Drawer **Detalhes do cliente**: dados pessoais, perfis de acesso, assinatura atual, histórico de faturas, histórico de uso (gráfico mensal), auditoria filtrada por `user_id`, botão "Impersonar" (login as user) — opcional, fica para fase 2 se preferir.

### b) Aba **Planos**
CRUD visual de `plans` com editor de features (form com inputs numéricos para cada limite + switches para flags). Preview de como o plano aparece na página pública de pricing. Toggle ativo/inativo, reordenação.

### c) Aba **Assinaturas**
Lista de `subscriptions` com filtros por status, plano, vencimento próximo. Ações: cancelar, reativar, alterar plano, estender trial, marcar como pago manualmente.

### d) Aba **Faturamento**
Sub-tabs:
- **Faturas** — lista de `invoices` com filtros (status, período, plano), ações: marcar paga, gerar nova, reembolsar, reenviar link.
- **Cupons** — CRUD de `coupons` + lista de redemptions.
- **Métricas** — cards de MRR, ARR, clientes ativos pagos, churn 30d, novos signups 30d, taxa de conversão trial→pago, gráfico de receita mensal (12m).

## 4. Página pública de pricing e checkout

- Nova rota `/planos` (pública) — lista os `plans` ativos, destaca o atual do usuário logado.
- Nova rota `/checkout/:planSlug` — formulário de upgrade com campo de cupom, escolha de período (mensal/anual), seleção de método (Pix/Boleto/Cartão).
- Edge function **`create-subscription`** — recebe plano + cupom + método, valida cupom, cria registro `subscription` (`pending`) + `invoice` (`open`), retorna mock de URL de pagamento e dados Pix. **Estrutura agnóstica**: cliente nacional será plugado depois (Asaas é o mais provável — Pix nativo, boleto, cartão recorrente, webhooks).
- Edge function **`subscription-webhook`** (placeholder) — endpoint pronto para receber eventos do gateway e atualizar status de fatura/assinatura.

Sem chamadas reais ao gateway nesta fase — toda a UI/dados ficam funcionais com fluxo mockado (admin marca faturas como pagas manualmente). Integração real do Asaas/Iugu fica para a próxima conversa, plugando apenas as 2 edge functions.

## 5. Seeding inicial

Insert dos 4 planos padrão sugeridos (ajustáveis depois via UI):
- **Free** — R$ 0 — 1 perfil, 50 lançamentos/mês, sem IA, sem export PDF.
- **Starter** — R$ 29,90/mês — 3 perfis, 500 lançamentos, export PDF.
- **Pro** — R$ 59,90/mês — 10 perfis, ilimitado, IA, relatórios avançados.
- **Business** — R$ 149,90/mês — ilimitado, IA, multiusuário, suporte prioritário.

## 6. Detalhes técnicos

- Todos os valores monetários em centavos (`integer`) para evitar float.
- `audit_logs` ganha entradas para alterações de plano/assinatura/fatura/cupom feitas pelo admin.
- Hooks novos em `src/hooks/`: `useCurrentSubscription`, `usePlanLimit`, `usePlans`, `useSubscriptions`, `useInvoices`, `useCoupons`.
- Componentes novos em `src/components/admin/`: `AdminPlans`, `AdminSubscriptions`, `AdminInvoices`, `AdminCoupons`, `AdminBillingMetrics`, `CustomerDetailDrawer`, `PlanEditorDialog`, `CouponFormDialog`.
- Componentes em `src/components/billing/`: `UpgradePrompt`, `SubscriptionBanner`, `PlanCard`, `PricingTable`, `CheckoutForm`.
- Validações Zod em `src/lib/validations.ts` (planSchema, couponSchema, checkoutSchema).
- Memória atualizada com nova feature page (`mem://features/billing-system`).

## 7. Fora de escopo nesta fase

- Integração real com gateway de pagamento (próxima fase — basta plugar Asaas nas edge functions já criadas).
- Comunicação em massa / e-mails transacionais de cobrança.
- Métricas avançadas (cohort, LTV).
- Multi-moeda — fica em BRL.
