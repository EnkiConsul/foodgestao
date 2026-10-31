# Open Finance (Pluggy) — arquitetura real (revisado em 31/10/2026, Fase 3)

## Cliente da Pluggy
- Único cliente: `supabase/functions/_shared/pluggy.ts` (auth com cache, connect token, items, accounts, transactions, bills, webhooks).
- `pluggy-client.ts` (usava `/transactions` v1 e a chave `oauthRedirectUrl`) foi removido junto com o código morto que dependia dele (`materialize-pluggy-item.ts`, `pluggy-webhook-processor.ts` e testes, que gravavam em tabelas `open_finance_*` inexistentes).

## Tabelas
| Tabela | Papel | Acesso pelo app (authenticated) |
|---|---|---|
| `pluggy_connect_requests` | Solicitação de conexão; `clientUserId = ofreq:<id>` | SELECT (RLS) |
| `pluggy_connections` | Item por empresa, status, tentativas, fila `needs_remote_delete` | SELECT (RLS) |
| `pluggy_accounts` | Contas BANK/CREDIT, vínculo local, lacuna de extrato (`statement_gap_*`, `statement_gap_checks`), `raw` | SELECT (RLS) |
| `pluggy_staging_transactions` | Extrato a conciliar, `raw` | SELECT (RLS) |
| `pluggy_webhook_events` | Inbox de webhooks com retry/dead letter | nenhum (só service_role) |

anon não tem acesso a nenhuma `pluggy_*`. Escritas só pelas funções do servidor e RPCs `SECURITY DEFINER`.

## Funções
- `pluggy-connect-token`: cria solicitação e token; `oauthRedirectUri` só para hosts de `PLUGGY_OAUTH_REDIRECT_HOSTS` (padrão: produção + preview, sem curinga).
- `pluggy-sync-item`: prova de posse no primeiro vínculo, checagem de conta duplicada (só BANK), importação, conferência de extrato.
- `pluggy-webhook`: valida `x-webhook-secret` e só enfileira em `pluggy_webhook_events`.
- `pluggy-webhook-worker`: claim SKIP LOCKED, backoff, dead letter.
- `pluggy-cron-sync`: claim por `pluggy_connections_claim_due`, limites por env validados ≤ 120 s.
- `pluggy-disconnect-item` / `pluggy-pause-or-delete`: revogação; falha remota vai para `needs_remote_delete`.
- `pluggy-remote-delete-worker`: processa a fila de remoção remota.
- `pluggy-reconcile-items`: autoriza por `pluggy_user_can_manage_accounts`, aceita só `ofreq:<id>`, carrega só os itens candidatos.
- `pluggy-webhook-config`, `pluggy-admin-find-items`: super admin.

## Crons
| Job | Frequência |
|---|---|
| `pluggy-webhook-worker-tick` | a cada minuto |
| `pluggy-cron-sync-10min` | a cada 10 min (cada conexão é pega quando vence) |
| `pluggy-remote-delete-worker-5min` | a cada 5 min |

## Regras
- Posse: primeiro vínculo exige `ofreq:<id>` da mesma empresa/usuário em 24 h (ou legado clientUserId com solicitação recente); senão 403 `item_not_owned`.
- Duplicidade entre empresas: número + connector + agência (quando ambos têm), só BANK.
- Extrato: transações PENDING não entram no staging nem na conferência; lacuna < R$ 1,00 ignorada; reconectar só é sugerido após 3 detecções seguidas.
- Remoção remota nunca é anunciada antes de o banco confirmar.

## Coluna `raw` (Item 13 — só relatório)
- `pluggy_accounts.raw` traz `taxNumber` e `owner` (CPF/CNPJ e nome do titular). `pluggy_staging_transactions.raw` traz pagador/recebedor com documento.
- Hoje qualquer membro da empresa com leitura (inclusive perfil contabilidade/leitor) lê `raw`.
- O app depende de `raw` em: `usePluggyCreditReview` (revisão de cartões), `ConciliacaoPluggy` (contas e `select *` do extrato), `src/lib/conciliacao/history.ts` (memória da conciliação).
- Recomendação (não implementada por tocar 3 fluxos): (1) extrair os campos usados (`counterparty_document`, nome, bandeira/limite do cartão) em colunas próprias; (2) trocar `select *` por lista explícita; (3) só então `REVOKE SELECT (raw)` via grants por coluna para authenticated, deixando `raw` para service_role e uma RPC restrita a quem tem gestão financeira.

## Homologação (Item 15)
- O projeto de homologação não tem as funções `pluggy-*` publicadas; a guarda de transporte do app bloqueia Open Finance nesse ambiente.
- Para espelhar: publicar as 11 funções `pluggy-*`; segredos Pluggy **sandbox** (`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`, `PLUGGY_CRON_SECRET`/`WEBHOOK_WORKER_SECRET`, `PLUGGY_OAUTH_REDIRECT_HOSTS`); os 3 crons acima; migrações até a 0179; webhook registrado na Pluggy apontando para homologação; liberar as funções na guarda.
- Risco atual: todo teste de Pluggy acontece em produção, com bancos e dados reais e consumo de itens da conta Pluggy.
