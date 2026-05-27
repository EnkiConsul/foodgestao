## Objetivo

Inserir a escolha de plano como nova etapa obrigatória do onboarding, posicionada **logo após "Tipo de perfil"** e antes de "Seus dados". Assim o fluxo passa a ser: cadastro → confirmação de e-mail → tipo de perfil → **escolher plano** → seus dados → primeira conta → categorias.

## Mudanças

### 1. Novo componente `src/components/onboarding/StepPlan.tsx`
- Lista os planos públicos (`usePlans`, filtrando `is_active && is_public`).
- Mostra cards compactos (nome, preço, trial, principais features) já no estilo da página `/planos`, mas otimizados para caber no accordion.
- Seleção via clique no card (estado controlado, marca borda primária no escolhido).
- Para plano gratuito → apenas registra a escolha localmente.
- Para plano pago → botão "Assinar" abre `/checkout/:slug` em nova aba/rota mantendo o progresso salvo (auto-save do onboarding já cobre).
- Mostra badge "Plano atual" quando `useCurrentSubscription` já bate com o selecionado (usuário novo cai no `free` por trigger).

### 2. `src/pages/Onboarding.tsx`
- Adicionar `plan` à união `StepKey` e ao array `STEPS` na **segunda posição**:
  ```
  profile → plan → data → account → categories
  ```
- Estender `OnboardingData` com `selectedPlanSlug: string` (default: `"free"`).
- Estender `DEFAULT_COMPLETED` com `plan: false`.
- `validateStep("plan")`: exige `selectedPlanSlug` não vazio. Se for plano pago, exigir que `useCurrentSubscription` confirme assinatura ativa/trialing daquele plano (ou seja, usuário concluiu checkout) — caso contrário toast pedindo para concluir o pagamento. Plano grátis é aceito imediatamente.
- `renderStepContent("plan")` → renderiza `StepPlan`.
- Ordem do `next` em `handleConfirmStep` segue array `STEPS` (já é dinâmico).
- `handleFinish` permanece igual (não cria assinatura — trigger SQL já criou a free no signup; planos pagos foram tratados no checkout).

### 3. Persistência
- `selectedPlanSlug` entra no JSON `onboarding_data` (já salvo via debounce). Sem migration nova.

## Pontos técnicos

- `usePlans` retorna todos os planos (admin scope). Como a policy `plans_select_public` já permite leitura pública dos `is_public=true`, o hook funciona para o usuário comum.
- Volta do checkout: o `CheckoutPagamento` já redireciona; ao retornar para `/onboarding`, a hidratação carrega `selectedPlanSlug` salvo e o `useCurrentSubscription` confirma o status. Adicionar `useBillingRealtime` no Onboarding garante atualização instantânea quando o webhook Asaas confirmar o pagamento.
- Nenhuma alteração em backend, RLS ou edge functions.

## Fora de escopo

- Não alterar o fluxo de signup/confirmação de e-mail.
- Não alterar `Auth.tsx` nem `App.tsx` (gate de onboarding continua o mesmo).
- Não mexer na página pública `/planos`.
