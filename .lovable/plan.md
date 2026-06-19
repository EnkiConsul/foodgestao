## Objetivo

Permitir que o super admin isente um cliente da cobrança da mensalidade, de forma permanente ou por período definido, dando-lhe acesso a um plano específico escolhido, e cancelando a assinatura correspondente no Asaas.

## Como vai funcionar para o usuário

### Tela "Assinaturas" (admin)
- Nova coluna **Isenção** com badge: "Isento (permanente)", "Isento até dd/MM/yy" ou "—".
- Nova ação por linha: **Isentar** (abre diálogo) ou **Remover isenção**.

### Tela "Clientes" (admin)
- Nova coluna **Plano/Isenção** mostrando plano atual e, se houver, badge de isenção.
- Ação no menu da linha: **Isentar mensalidade** / **Remover isenção**.

### Diálogo "Isentar mensalidade"
Campos:
1. **Plano liberado** — select com todos os planos ativos (default: o plano atual do cliente, se houver).
2. **Tipo de isenção** — rádio: *Permanente* / *Até uma data*.
3. **Data fim** — date picker (visível só quando "Até uma data"). Obrigatório nesse caso, deve ser futura.
4. **Motivo** (texto opcional, salvo no audit log).

Ao confirmar:
- Cancela a assinatura ativa no Asaas (se existir `external_subscription_id`).
- Atualiza a assinatura local para o plano escolhido, status `active`, marca como isenta com os campos abaixo.
- Toast "Cliente isentado" e refresh das listas.

### Remover isenção
- Confirmação simples. Limpa os campos de isenção; assinatura volta ao status `active` no plano atual. **Não** recria assinatura no Asaas automaticamente — quando o cliente quiser voltar a pagar, fará novo checkout (mesmo fluxo já existente quando a assinatura é cancelada). Mostramos esse aviso no diálogo de remoção.

### Efeito no app do cliente
- Enquanto isento (`is_exempt = true` e, se houver `exempt_until`, ainda não venceu), o backend trata a assinatura como ativa com o plano liberado. Cliente não vê banner de pagamento.
- Quando `exempt_until` vence, um job já existente (`expire-trials`) é estendido para também encerrar isenções vencidas: marca `is_exempt = false` e coloca a assinatura como `past_due`, voltando ao fluxo normal de cobrança.

## Detalhes técnicos

### Migration
Adicionar à tabela `public.subscriptions`:
- `is_exempt boolean not null default false`
- `exempt_until timestamptz` (null = permanente)
- `exempt_reason text`
- `exempted_by uuid references auth.users(id)`
- `exempted_at timestamptz`

Atualizar `get_user_plan_features` (e qualquer view de status de assinatura) para considerar `is_exempt` ainda válida como ativa.

### Edge function `admin-exempt-subscription` (nova)
- Verifica `is_super_admin(auth.uid())`.
- Body: `{ subscriptionId, planId, mode: "permanent" | "until", exemptUntil?, reason? }` (Zod).
- Carrega assinatura via service role.
- Se `external_subscription_id`, chama `DELETE /subscriptions/{id}` no Asaas (reutilizando `asaasFetch` de `_shared/asaas.ts`), tolerando falha com log.
- `update subscriptions set is_exempt=true, exempt_until, exempt_reason, exempted_by, exempted_at=now(), plan_id, status='active', external_subscription_id=null, canceled_at=null where id=...`.
- Insere audit log `subscription_exempted`.

### Edge function `admin-remove-exemption` (nova)
- Mesma verificação de super admin.
- Limpa campos de isenção e mantém `status='active'`. Audit log `subscription_exemption_removed`.

### Job `expire-trials`
Adicionar passo: atualizar subs com `is_exempt = true and exempt_until < now()` para `is_exempt=false, exempt_until=null` e `status='past_due'`.

### Frontend
- `src/hooks/useBilling.tsx`: novos hooks `useExemptSubscription` e `useRemoveExemption` que chamam as edge functions e invalidam `admin-subscriptions`, `admin-users`, `current-subscription`.
- Novo componente `src/components/admin/ExemptSubscriptionDialog.tsx` com o formulário descrito (Zod via `validateWithToast`).
- Atualizar `src/components/admin/AdminSubscriptions.tsx`: coluna Isenção, botão "Isentar"/"Remover isenção".
- Atualizar `src/components/admin/AdminUsers.tsx`: buscar assinatura corrente (já disponível via join ou query extra por user_id), mostrar badge e ação de menu que abre o mesmo diálogo passando o `subscriptionId`.
- `src/lib/billing.ts`: helpers `isExempt(sub)` e label de badge.

### Logs/Auditoria
- Ações `subscription_exempted` e `subscription_exemption_removed` registradas com `entity_type='subscription'`, detalhes `{ user_id, plan_id, mode, exempt_until, reason }`.
