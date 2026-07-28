## Auditoria — integração Pluggy vs. `docs.pluggy.ai/docs/authentication`

Comparei o que a doc oficial define com o que já está no projeto (`supabase/functions/_shared/pluggy-client.ts`, `pluggy-connect-token`, `pluggy-webhook-configure` e o widget em `OpenFinanceWizard.tsx`).

### O que já está correto
- Fluxo `POST /auth` com `clientId`/`clientSecret` → `apiKey`, mantido apenas no servidor.
- `POST /connect_token` roda em edge function autenticada; o widget só recebe o `accessToken` de curta duração.
- TTL do Connect Token tratado como 30 min e um token por conexão (novo `request_id` a cada abertura do wizard).
- `X-API-KEY` no header para chamadas server-side (aceito pela Pluggy).
- Credenciais nunca são retornadas ao cliente; `safePluggyError` filtra mensagens que carreguem tokens/secret.

### Divergências encontradas (a corrigir)

**P1 — `oauthRedirectUrl` ausente no Connect Token**
A doc lista `oauthRedirectUrl` entre os `ItemOptions`. Bancos com fluxo OAuth (Itaú, Bradesco, Santander etc.) exigem esse retorno para reentregar o usuário após o consentimento no app do banco. Hoje `createConnectToken` envia só `clientUserId`, `avoidDuplicates` e `webhookUrl`. Efeito prático: em conectores OAuth o usuário pode ficar preso na tela do banco ou o item não sair de `WAITING_USER_ACTION`.

**P1 — `avoidDuplicates: true` também em reconexão**
Em `pluggy-connect-token/index.ts` (linhas 136-141) enviamos `avoidDuplicates: true` mesmo quando `itemId` está presente (modo reconnect). A doc de `items-update` orienta não combinar as duas opções — o correto é aplicar `avoidDuplicates` só quando `mode === 'new'`. Sem isso, reconexões podem ser rejeitadas pela Pluggy como duplicadas do item que estamos justamente atualizando.

**P2 — `clientUserId` novo a cada reconexão**
Hoje geramos `ofreq:<request_id>` em todo request, inclusive em reconnect. A doc recomenda preservar o `clientUserId` original vinculado ao item para manter a rastreabilidade Pluggy↔usuário. Em reconnect devemos ler o `clientUserId` já registrado em `open_finance_connections.metadata` (ou `client_user_id` da conexão original) e reutilizá-lo.

**P2 — `access_token` do Connect Token persiste indefinidamente**
`pluggy-connect-token` guarda `access_token` em `open_finance_connection_requests.metadata` para permitir reuso por `idempotency_key`. O registro fica na tabela para sempre; após os 30 min da doc o token está inválido mas o campo permanece. Deve haver uma limpeza: sanear `metadata.access_token` quando `token_expires_at < now()` (via job leve ou trigger de leitura em `pluggy-webhook-drain` / cleanup semanal já existente).

**P3 — Retry não considera `429 Too Many Requests`**
`request()` em `_shared/pluggy-client.ts` só re-tenta em `network_error` e HTTP ≥ 500. A doc/reference cita rate limit; incluir `429` no conjunto transiente com backoff exponencial (respeitando `Retry-After` quando presente) evita falhas duras em rajadas do worker/sync.

**P3 — TTL da API key hardcoded em 90 min**
`AUTH_TTL_MS = 90 * 60 * 1000` assume o valor citado na doc (~2h) sem validar. O `apiKey` retornado é um JWT com `exp` real — se a Pluggy encurtar o TTL num plano específico, teremos 401 antes do refresh. Melhor decodificar `exp` do JWT e programar renovação uns 5 min antes do vencimento real, mantendo o teto atual como fallback.

### Escopo NÃO incluído
- Verificação de assinatura de webhook (P0 já resolvido).
- Cursor v2 real (fase separada).

### Detalhes técnicos

Arquivos afetados:

```text
supabase/functions/_shared/pluggy-client.ts
  · createConnectToken: aceitar oauthRedirectUrl opcional; só injetar
    avoidDuplicates quando NÃO há itemId.
  · authenticate: extrair `exp` do JWT apiKey (base64 do payload) e
    definir expiresAt = min(exp*1000 - 5min, now + 90min).
  · request/requestOnce: tratar 429 como transiente e ler Retry-After.

supabase/functions/pluggy-connect-token/index.ts
  · Novo campo no BodySchema: oauth_redirect_url (opcional, string url).
  · Em modo reconnect: buscar clientUserId da conexão original em
    open_finance_connections.client_user_id (ou metadata) e reutilizar,
    caindo para ofreq:<request_id> só se ausente.
  · Repassar oauth_redirect_url ao createConnectToken; default = URL pública
    do app (VITE-like via env PLUGGY_OAUTH_REDIRECT_URL), fallback para o
    domínio publicado (foodgestao.lovable.app / gestor360food.com).

Migração leve:
  · Função pluggy_purge_expired_connect_tokens() que limpa
    metadata->>'access_token' onde token_expires_at < now() - 5 min.
  · Agenda no cron pluggy-cleanup-weekly (já existente) para reaproveitar.

src/components/accounts/OpenFinanceWizard.tsx
  · Enviar oauth_redirect_url = `${window.location.origin}/contas-bancarias`
    no supabase.functions.invoke('pluggy-connect-token', ...).
```

Fluxo esperado em conectores OAuth após a correção:

```text
Usuário → Widget → connect_token (com oauthRedirectUrl)
                          ↓
                    Pluggy /connect_token
                          ↓
       redireciona ao app do banco (OAuth) → volta a /contas-bancarias
                          ↓
              webhook item/created + materialize normal
```

### Verificação após implementar
1. `supabase functions invoke pluggy-connect-token` novo/reconnect e conferir o payload enviado (logs) — sem `avoidDuplicates` quando `item_id` presente.
2. Conectar um banco OAuth (Itaú sandbox) pelo wizard e confirmar retorno automático à página.
3. Rodar duas conexões seguidas com forced 429 (mock) para validar que o cliente re-tenta.
4. Consultar `open_finance_connection_requests` 1h depois de um token e conferir que `metadata.access_token` foi zerado.
