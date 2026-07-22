## Diagnóstico

Analisei conexões, webhooks e o fluxo de sync. O que está acontecendo com **Santander Empresas** e **C6 Bank Empresas**:

1. Você clica em **Sincronizar** → `pluggy-sync-connection` chama `/transactions` → Pluggy responde **410 Gone** (produto `TRANSACTIONS` ainda não coletado nesse item).
2. A função dispara `PATCH /items/:id` pedindo `["ACCOUNTS","TRANSACTIONS","IDENTITY"]` (`triggerItemUpdate`).
3. Marca `status=updating` no banco e mostra "Coletando lançamentos na Pluggy…".
4. **A Pluggy nunca notifica o fim da coleta.** Confirmei em `pluggy_webhook_events`: dos últimos 27 eventos, **25 são `connector/status_updated` (globais)**; nenhum `item/updated`, `transactions/updated` ou `item/waiting_user_input` chega para os itens Santander/C6.
5. Sem callback, a UI fica presa em "Atualizando" para sempre. E ao sincronizar de novo, cai no rate-limit (1 update/hora) ou retorna 410 outra vez.

### Causa raiz (duas coisas somadas)

**A) O `webhookUrl` não está sendo persistido no item Pluggy.**
Em `pluggy-connect-token/index.ts` o `webhookUrl` é enviado só no `/connect_token`. A Pluggy só respeita esse campo se estiver **também** no PATCH/criação do item. Como usamos `POST /items` implicitamente (via Connect Widget) e depois `PATCH /items` sem `webhookUrl`, o item termina **sem webhook associado** → nenhum evento `item/*` chega.

**B) `pluggy-sync-connection` sobrescreve o `status` real com `"updating"`.**
No fim da função:
```ts
const finalStatus = itemUpdateTriggered ? "updating" : (item.status ?? "active").toLowerCase();
```
Se a Pluggy já reportou `WAITING_USER_INPUT` (MFA), `LOGIN_ERROR` (credencial inválida) ou `OUTDATED` (produto não suportado), perdemos essa informação e o usuário só vê "Atualizando". A verificação também não usa `executionStatus` (que traz o motivo específico: `USER_AUTHORIZATION_PENDING`, `USER_CREDENTIALS_INVALID`, `SITE_NOT_AVAILABLE`, etc.).

## Correções propostas

### 1. Registrar webhook por item (backend)

- Em `_shared/pluggy.ts`, aceitar `webhookUrl` opcional em `triggerItemUpdate` e enviar no PATCH.
- Em `pluggy-register-item`, logo após `getItem`, se `item.webhookUrl` for diferente do nosso, chamar `PATCH /items/:id` com `{ webhookUrl }` para vincular o webhook definitivo.
- Em `pluggy-sync-connection`, ao chamar `triggerItemUpdate`, passar o mesmo `webhookUrl` para garantir amarração retroativa dos itens já criados.

### 2. Respeitar o status real da Pluggy (backend)

Em `pluggy-sync-connection`:
- Ler `item.status` **e** `item.executionStatus` de `getItem`.
- Salvar `status` como o status da Pluggy em minúsculas (`updating`, `waiting_user_input`, `login_error`, `outdated`, `updated`).
- Só marcar `updating` local quando `item.status` também for `UPDATING`.
- Popular `last_error` com mensagem específica por `executionStatus`:
  - `USER_AUTHORIZATION_PENDING` / `WAITING_USER_INPUT` → "Ação necessária: reconecte para completar a autenticação (MFA/token)."
  - `USER_CREDENTIALS_INVALID` → "Credenciais inválidas — reconecte a instituição."
  - `SITE_NOT_AVAILABLE` → "Instituição indisponível no momento na Pluggy. Tente mais tarde."
  - `USER_NOT_SUPPORTED` → "Este tipo de conta não expõe extrato via Open Finance."
  - 410 persistente após 2 tentativas → "A instituição ainda não liberou o produto TRANSACTIONS neste consentimento."

### 3. UX no cartão de conexão (frontend `ContasBancarias.tsx`)

- Quando `status ∈ {waiting_user_input, login_error, outdated}` → mostrar botão **Reconectar** (abre Connect Widget com `itemId` para MFA/refresh) em vez de só "Sincronizar".
- Quando `status === "updating"` e `last_sync_at` for mais antigo que ~10 min → exibir aviso "Coleta demorou mais que o esperado — clique em Reconectar".
- Adicionar auto-refresh (`refetchInterval: 15s`) enquanto qualquer conexão estiver `updating`, para pegar mudança via webhook sem F5.

### 4. Diagnóstico visível (opcional, admin)

Mostrar `executionStatus` como tooltip no badge "Atualizando" para investigação futura.

## Detalhes técnicos

**Arquivos afetados:**
- `supabase/functions/_shared/pluggy.ts` — expõe `PluggyItem.executionStatus` e `webhookUrl`; `triggerItemUpdate` aceita `webhookUrl`.
- `supabase/functions/pluggy-register-item/index.ts` — PATCH pós-registro para vincular webhook.
- `supabase/functions/pluggy-sync-connection/index.ts` — status/executionStatus, mensagens dedicadas, mantém `updating` só quando aplicável.
- `src/pages/ContasBancarias.tsx` (e/ou componente de card Pluggy) — botão Reconectar contextual + polling.
- `src/hooks/usePluggy.ts` — `refetchInterval` condicional.

**Sem migration nova** — os campos `status`, `last_error`, `consent_expires_at` já existem em `bank_connections`.

## Verificação pós-correção

1. Reconectar Santander/C6 (para re-emitir consent com webhook amarrado).
2. Confirmar em `pluggy_webhook_events` a chegada de `item/updated` em minutos.
3. Card sai de "Atualizando" automaticamente quando a coleta termina.
4. Se banco pedir MFA, card mostra **Reconectar** com o motivo correto.
