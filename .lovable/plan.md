## Reativar `PLUGGY_USE_GLOBAL_WEBHOOK` e fechar a transição

Escopo confirmado: **sem** Fase 1 (não vou recuperar o item já criado do C6). Novas conexões passam a funcionar; a conexão atual do C6 fica órfã e será marcada como `error` para não poluir os painéis — se depois quiser trazê-la, refazemos pelo wizard.

### Fase 2 — Reativar o webhook global autenticado
1. `set_secret PLUGGY_USE_GLOBAL_WEBHOOK=true` no cofre (runtime secret).
2. Invocar `pluggy-webhook-configure` com `PLUGGY_CRON_TICK_SECRET` para (re)registrar o webhook global no Pluggy com o `PLUGGY_WEBHOOK_TOKEN` atual. Se já existir, a função faz update idempotente do token e da URL.
3. Redeploy de `pluggy-connect-token` (passa a **omitir** `webhookUrl` por item quando a flag global está `true`) e de `pluggy-webhook` (garante versão fail-closed atual). Sem alterações de código nesta fase — só flag + deploy.

### Fase 3 — Rede de segurança no wizard
Em `src/components/accounts/OpenFinanceWizard.tsx`:
- No callback `onSuccess({ item })` do SDK Pluggy, **sempre** invocar `supabase.functions.invoke('pluggy-item-materialize', { item_id, company_id })` e exibir toast de erro visível quando falhar (hoje falha silenciosamente).
- Se `item` vier sem `id` (fluxos OAuth que retornam pelo redirect `oauthRedirectUrl`), fazer polling curto (até 20 s, intervalo 2 s) na tabela `open_finance_connections` filtrando por `client_user_id = ofreq:<request_id>` antes de fechar o wizard como sucesso. Se estourar o tempo, mensagem clara: "banco conectado, aguardando confirmação — atualize em instantes".

### Fase 4 — Prevenção de estado órfão
Migração + job:
- Função `pluggy_expire_stale_connect_requests()` que marca como `expired` toda `open_finance_connection_requests` com `status='token_created'`, `pluggy_item_id IS NULL` e `created_at < now() - interval '30 minutes'`.
- Antes de expirar, chamar `GET /items?clientUserId=<request.clientUserId>` (via `pluggy-remote-reconcile` — novo micro-endpoint interno ou reaproveitando o worker de purge) e, se achar o `itemId`, disparar `pluggy-item-materialize` — resgate automático de quem só perdeu o `onSuccess`.
- Agendar no cron existente `pluggy-cleanup-weekly` **e** um tick de 15 min no `pg_cron` já usado por outros workers.

Também nesta fase: marcar as 4 requests órfãs atuais da Raptor como `expired` para higienizar o painel.

### Detalhes técnicos

Arquivos/objetos tocados:
```text
supabase/functions/pluggy-connect-token/index.ts    (respeita PLUGGY_USE_GLOBAL_WEBHOOK=true)
supabase/functions/pluggy-webhook/index.ts          (redeploy — sem mudança)
supabase/functions/pluggy-webhook-configure/…       (invocação de registro)
src/components/accounts/OpenFinanceWizard.tsx       (materialize + polling de reconciliação)
Nova função SQL: public.pluggy_expire_stale_connect_requests()
Novo cron: pluggy-expire-stale-requests (a cada 15 min)
```

### Verificação após implementar
1. Nova conexão de teste (banco simples — Nubank ou C6 PF) deve criar linha em `open_finance_webhook_events` com `status='success'` em poucos segundos.
2. `open_finance_connections` recebe o item e a conta aparece em `/contas-bancarias` sem clique manual.
3. `/admin/pluggy-webhook-logs` sem backlog e com health "verde".
4. Rodar manualmente `select pluggy_expire_stale_connect_requests();` e conferir que as 4 requests órfãs da Raptor viram `expired`.

Confirma para eu partir para o build?
