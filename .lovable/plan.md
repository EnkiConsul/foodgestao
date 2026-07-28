# Plano de Correção P0 — Sincronização Pluggy / Open Finance

Objetivo: fechar os 5 gaps críticos identificados na auditoria para tornar a integração Pluggy homologável em produção, sem depender do navegador, sem transações fantasmas e com agendamento real de sync.

## Ordem de execução

Segue o critério "desbloqueia o próximo passo primeiro". Cada bloco é independente e verificável isoladamente.

```text
1. Materialização de conexão (server-side)
2. Paginação por cursor (/v2/transactions)
3. Tratamento de deleções na origem
4. Cron real via pg_cron + pg_net
5. Desconexão remota (DELETE /items na Pluggy)
```

---

## Bloco 1 — Materialização de conexão server-side (P0-1)

Problema: hoje a linha em `open_finance_connections` só é criada se o callback do widget rodar no navegador. Se o usuário fechar a aba ou a rede cair, o item existe na Pluggy mas some do nosso sistema.

Ações:
- Nova edge function `pluggy-item-materialize` que recebe `{ item_id }`, chama `GET /items/{id}` na Pluggy e faz upsert em `open_finance_connections` + `open_finance_accounts` (idempotente por `pluggy_item_id`).
- Chamada a partir de dois pontos:
  1. Callback do widget (fluxo feliz) — mantém UX atual.
  2. Webhook `item/created` e `item/updated` — garante materialização mesmo sem callback.
- `pluggy-connect-token` passa a persistir `open_finance_connection_requests` com o `client_user_id` para amarrar o item ao tenant quando o webhook chegar antes do callback.

## Bloco 2 — Paginação por cursor v2 (P0-2)

Problema: o worker atual usa `GET /transactions?page=N`, que é a API legada. A v2 usa cursor (`from`, `pageSize`, `next`), é mais rápida e é a única que expõe `deletedAt`.

Ações:
- Refatorar `pluggy-sync` para consumir `GET /v2/transactions/{accountId}` com cursor.
- Guardar o `next` cursor em `open_finance_accounts.sync_cursor` (nova coluna) para retomar de onde parou entre execuções.
- Fallback: se a Pluggy responder 404 na v2 para uma conta legada, cair no endpoint antigo apenas para aquele item, logando em `open_finance_sync_runs.notes`.

## Bloco 3 — Deleções na origem (P0-3)

Problema: quando a Pluggy marca uma transação como deletada (estorno, ajuste do banco), nosso staging mantém a linha, e a promoção para `transactions` cria duplicata.

Ações:
- Nova coluna `open_finance_transactions_raw.deleted_at timestamptz`.
- Worker marca `deleted_at = now()` quando a v2 devolve `deletedAt != null` (match por `pluggy_transaction_id`).
- `auto_promote_open_finance_raw` passa a ignorar linhas com `deleted_at` e, se a transação já foi promovida, marca o `transactions.status = 'cancelado'` com origem `open_finance_delete` (não deleta o registro para preservar auditoria).

## Bloco 4 — Cron real (P0-4)

Problema: existe a função `enqueue_open_finance_scheduled_syncs`, mas não há job `pg_cron` ativo apontando para ela em produção. Sync depende de disparo manual.

Ações:
- Habilitar extensões `pg_cron` e `pg_net` se ainda não estiverem.
- Agendar `enqueue-open-finance` a cada 15 minutos chamando a edge function via `net.http_post` com header `apikey` = anon key (o dispatch interno usa `service_role`).
- Adicionar métrica: última execução aparece em `/admin/open-finance` (painel de observabilidade já existente).

## Bloco 5 — Desconexão remota (P0-5)

Problema: `disconnect_open_finance_connection` só marca a linha como inativa localmente; o item continua vivo na Pluggy consumindo cota.

Ações:
- Nova edge function `pluggy-item-delete` que chama `DELETE /items/{id}` com retry (429/5xx).
- RPC de desconexão passa a agendar a edge function via `pg_net`; se falhar, marca `open_finance_connections.needs_remote_delete = true` para retry manual.
- Botão "Desconectar" na UI passa a mostrar estado "aguardando remoção remota" até o webhook `item/deleted` confirmar.

---

## Detalhes técnicos

- Todas as edge functions novas usam o cliente compartilhado em `supabase/functions/_shared/pluggy.ts` (rate limit, retry com backoff exponencial e assinatura HMAC do webhook já implementados).
- Migrations adicionam apenas colunas nullable e um índice em `open_finance_transactions_raw(deleted_at)` — não há breaking change.
- Testes: cenários novos em `supabase/functions/pluggy-sync/index.test.ts` cobrindo cursor v2, deleção e retomada.
- Observabilidade: cada bloco grava em `open_finance_sync_runs` (status, contadores, erros) e em `audit_logs` quando afeta transações já confirmadas.

## Fora deste plano (fica para P1 depois)

- Endurecimento extra do webhook (rotação de segredo, verificação estrita de replay).
- Retry/backoff por conta com dead-letter queue visível na UI.
- Rastreabilidade cross-tenant (correlação `client_user_id` × `company_id` em logs unificados).

Confirma para eu executar bloco a bloco?
