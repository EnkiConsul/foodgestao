## Plano: Webhook do Pluggy

### O que será criado

Nova edge function pública `pluggy-webhook` (com `verify_jwt = false`) que recebe notificações do Pluggy e atualiza automaticamente as `bank_connections` + dispara sincronização de transações.

### Autenticação

- Novo secret `PLUGGY_WEBHOOK_SECRET` (você definirá o valor — o mesmo cadastrado no painel Pluggy).
- A função valida o header `X-Webhook-Secret` (ou `x-pluggy-signature`) contra esse secret. Se não bater → 401.

### Eventos tratados

Payload do Pluggy tem `event` + `itemId`. Mapeamento:

| Evento Pluggy | Ação |
|---|---|
| `item/updated` | Atualiza `bank_connections` (status=`active`, `last_sync_at`, `consent_expires_at`) e reutiliza `syncConnection()` de `pluggy-sync-item` (via import) para trazer novas transações. |
| `item/login_succeeded` | status=`active`, limpa `last_error`. |
| `item/error`, `item/login_error` | status=`login_error`, grava `last_error` com a mensagem/código do Pluggy. |
| `item/waiting_user_input` | status=`waiting_user_input`, grava `last_error` = "Requer nova autenticação/MFA". |
| `connector/status_updated` | Log apenas (não altera conexões — informativo). |
| Outros | Retorna 200 (ignora). |

Sempre responde `200 { received: true }` após processar (mesmo em ignore), para o Pluggy não re-tentar em loop. Só retorna 401 quando o secret falha e 500 em erro inesperado.

### Detalhes técnicos

- Arquivo: `supabase/functions/pluggy-webhook/index.ts`.
- Usa `SUPABASE_SERVICE_ROLE_KEY` (webhook é anônimo, precisa admin para atualizar qualquer conexão).
- Localiza a conexão via `provider_item_id = itemId`.
- Reutiliza `syncConnection()` já exportado por `pluggy-sync-item/index.ts` (import relativo) para não duplicar lógica de paginação de transações.
- `supabase/config.toml`: adiciona bloco `[functions.pluggy-webhook] verify_jwt = false`.
- CORS headers em todas as respostas (Pluggy envia de servidor, mas mantemos por consistência).

### Após implementar

Retornarei a URL pública no formato:
```
https://grtxmbffgmgnkawlvqhm.functions.supabase.co/pluggy-webhook
```
Você cola no painel Pluggy (Applications → Webhooks) junto com o valor do `PLUGGY_WEBHOOK_SECRET`.

### O que NÃO faz parte

- Não altera `pluggy-sync-all` (cron continua como fallback).
- Não adiciona UI — é 100% backend.
- Não persiste histórico bruto de eventos (podemos adicionar tabela `pluggy_webhook_events` numa segunda iteração se quiser auditoria).
