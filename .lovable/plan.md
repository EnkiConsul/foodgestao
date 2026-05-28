## Paywall de trial expirado + atualização automática + tela dedicada

Implementar bloqueio de acesso quando o período de teste de 14 dias terminar sem pagamento.

### 1. Tela dedicada "Trial expirado"

Criar `src/pages/TrialExpired.tsx`:
- Mensagem clara: "Seu período de teste gratuito terminou"
- Resumo do que o usuário perdeu acesso (lançamentos, relatórios, etc.)
- CTA primário: "Escolher um plano" → `/planos`
- CTA secundário: "Sair" (logout)
- Link discreto para suporte (`comercial@raptorsistemas.com`)
- Visual alinhado à identidade Gestor Plin (paleta azul, TreePine)

Adicionar rota `/trial-expirado` em `src/App.tsx` (fora de `ProtectedRoute` padrão, mas exige login).

### 2. Bloqueio via ProtectedRoute

Em `src/App.tsx` / `ProtectedRoute`:
- Após validar auth + onboarding, consultar `useCurrentSubscription`
- Se `status = 'trialing'` e `trial_ends_at < now()`, OU `status IN ('expired','canceled')`, OU `status = 'past_due'` há mais de X dias → redirecionar para `/trial-expirado`
- **Rotas permitidas mesmo com trial expirado** (whitelist):
  - `/trial-expirado`
  - `/planos`
  - `/checkout/*`
  - `/faturas`
  - `/configuracoes/perfil` (para dados de cobrança)
  - `/admin/*` (super_admin não é bloqueado)
- Super admins nunca são bloqueados

### 3. Atualização automática de status (`trialing` → `expired`)

**Edge Function** `supabase/functions/expire-trials/index.ts`:
- Usa `SUPABASE_SERVICE_ROLE_KEY`
- `UPDATE subscriptions SET status='expired' WHERE status='trialing' AND trial_ends_at < now()`
- Retorna contagem de registros atualizados
- Sem auth pública (chamada apenas via cron)

**Migration** (pg_cron + pg_net): agendar `expire-trials` para rodar 1x por dia às 03:00 BRT.

**Enum**: garantir que `subscription_status` já contém `'expired'` (verificar; adicionar se faltar).

### 4. Banner ajustado

`SubscriptionBanner`:
- Trial nos últimos 3 dias: aviso amarelo (já existe)
- Trial expirado (caso o usuário esteja em rota permitida como `/planos`): banner vermelho "Trial expirado — escolha um plano para reativar"

### Arquivos afetados

**Criar**
- `src/pages/TrialExpired.tsx`
- `supabase/functions/expire-trials/index.ts`
- Migration: enum `expired` (se necessário) + cron job

**Editar**
- `src/App.tsx` (rota + lógica de bloqueio no `ProtectedRoute`)
- `src/components/layout/SubscriptionBanner.tsx` (variante "expirado")
- `src/hooks/useCurrentSubscription.ts` (expor flag `isTrialExpired` / `isBlocked`)

### Detalhes técnicos

```text
ProtectedRoute flow:
  auth? ──► onboarding? ──► subscription check ──► render
                                  │
                                  ├─ active/trialing válido ► OK
                                  ├─ trialing expirado ─────► /trial-expirado
                                  ├─ expired/canceled ──────► /trial-expirado
                                  └─ super_admin ───────────► OK (bypass)

Whitelist (sem bloqueio):
  /trial-expirado, /planos, /checkout/*, /faturas,
  /configuracoes/perfil, /admin/*
```

O cron usa `pg_cron` + `pg_net` (já habilitados no projeto) e será inserido via `supabase--insert` (não migration), pois contém URL e anon key específicos do projeto.
