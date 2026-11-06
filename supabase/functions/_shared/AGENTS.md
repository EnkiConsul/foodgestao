# Regras do Pluggy (Open Finance) em `_shared` e nas funções `pluggy-*`

## Pluggy (Open Finance)
- `pluggy-reconcile-items` authorizes via `pluggy_user_can_manage_accounts`, accepts only `ofreq:<id>` and loads connections only for candidate item ids.
- PENDING age, in-place updates and supersession use `_shared/pluggy-pending.ts`; incremental lookback is bounded there. Statement-gap filtering, time persistence and reconnect eligibility follow rule 5 below, never a counter-only decision.
- Pluggy client: only `_shared/pluggy.ts` talks to the Pluggy API (the old `pluggy-client.ts` was removed); `clientUserId` is always `ofreq:<id>`; no service role or Pluggy secret in the frontend; secrets only in backend secrets.
- `oauthRedirectUri` hosts come from `PLUGGY_OAUTH_REDIRECT_HOSTS` (comma-separated, wildcards ignored), defaulting to production + project preview (`_shared/pluggy-oauth-redirect.ts`).

## Pluggy — Regras invioláveis

Arquitetura: `pluggy-connect-token` → Pluggy Connect Widget (v2.11.0 fixada) → `pluggy-sync-item` → staging (`pluggy_staging_transactions`) → conciliação. Webhook: `pluggy-webhook` (inbox, valida `x-webhook-secret`) → `pluggy-webhook-worker` (a cada 1 min, claim SKIP LOCKED, backoff, dead letter) → `pluggy-sync-item`. Cron: `pluggy-cron-sync` (a cada 6 horas, claim em lote via RPC `pluggy_connections_claim_due`).

1. Segredos: `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET`/`PLUGGY_WEBHOOK_SECRET` só em secrets do backend; nunca em código, log, resposta de função ou frontend.
2. Cliente único: só `_shared/pluggy.ts` fala com a API da Pluggy (v2, `/v2/transactions`); `clientUserId` é sempre `ofreq:<id>`.
3. Posse do item: primeiro vínculo exige prova de posse (`ofreq:<id>` mesma empresa/usuário em 24h); caso contrário 403 `item_not_owned`.
4. Conciliação: baixa em lançamento existente só via RPC `pluggy_conciliacao_baixar`/`pluggy_conciliacao_baixar_ajuste` (FOR UPDATE, idempotente, validação no servidor); pagamento menor oferece parcial (mantém saldo) ou desconto (quita).
5. Statement completeness: keep the PENDING age rule; exclude `raw._aveto_motivo` starting with `superseded_by:` from BOTH staging sums. Track first detection in `statement_gap_first_seen_at`, clear it on resolution, and suggest reconnect only after BOTH >= 3 consecutive detections AND `PLUGGY_GAP_PERSIST_HOURS` (default 48, minimum 24). Current-BRT-day-only gaps remain monitored without user warnings. Persist server eligibility in `statement_gap_reconnect_suggested` for the frontend; before eligibility use automatic-search guidance, never disconnect as the first action. Legacy gaps start timing at their next detection; do not infer elapsed time from the counter.
6. Duplicidade entre empresas: compara só contas BANK por número + connector_id (+ agência quando ambas têm); CREDIT ignorado.
7. Concorrência: todo processamento em lote usa claim atômico (FOR UPDATE SKIP LOCKED) — `pluggy_connections_claim_due`, `pluggy_remote_delete_claim`, claim do webhook worker.
8. Desconexão: remoção remota vai para fila `needs_remote_delete` processada por `pluggy-remote-delete-worker`; revogação nunca é anunciada como concluída antes do banco confirmar.
9. Limites do cron: `BATCH_SIZE`/`PARALLELISM`/`ITEM_TIMEOUT_MS`/`SYNC_WAIT_MS` por env com padrões seguros; `resolveCronLimits` garante ceil(lote/paralelismo) × timeout ≤ 120s.
10. `created_by`: em inserção usa o usuário da solicitação; sem usuário, `companies.user_id`; conexão existente nunca é regravada.
11. Ambientes: produção e homologação nunca se cruzam; testes só em homologação com funções/secrets/crons espelhados.
12. Cron secret: `pluggy-cron-sync` e `pluggy-remote-delete-worker` exigem `x-cron-secret` (`pluggy_cron_secret`).
13. Grants: anon sem acesso a `pluggy_*`; authenticated somente SELECT; `pluggy_webhook_events` só service_role. Toda tabela nova `pluggy_*` segue o mesmo padrão e tem RLS.
14. Lógica pura: mudanças em regras puras ficam em `_shared/*.ts` com teste unitário.

Checklist antes de alterar qualquer coisa Pluggy: a mudança respeita as regras 1–14? Há teste cobrindo a regra alterada? Cron, webhook ou worker mudaram? Conferir frequência e uso de claim atômico.
