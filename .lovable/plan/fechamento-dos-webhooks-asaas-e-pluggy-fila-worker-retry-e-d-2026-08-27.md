# Fechamento dos webhooks Asaas e Pluggy: fila, worker, retry e dead letter

Hoje os dois webhooks processam tudo dentro da própria requisição: o Asaas grava o evento e executa a lógica de faturas/assinaturas na hora; o Pluggy grava o evento e chama a sincronização inline. Não existe fila, tentativa automática nem dead letter — quando algo falha, o erro fica em texto na linha do evento e nunca é retomado. Estado verificado no banco: `pluggy_webhook_events` tem 351 eventos, 287 sem processamento; `asaas_webhook_events` tem 58, todos processados. As duas tabelas só têm `processed_at` e `error`, sem status, tentativas ou lease. As funções `pluggy_webhook_finalize_success/failure` existem no banco, mas a tabela e o claim que elas acompanhavam foram removidos em julho — estão órfãs. Nenhum dos dois webhooks trata `transactions/deleted`, e o `eventId` é opcional: quando não vem, o código inventa um id (timestamp/UUID), o que anula a proteção contra evento duplicado.

## Como vai passar a funcionar

1. **Recebimento só registra.** O webhook valida o segredo, exige o identificador do evento e grava na fila. Se o provedor não mandar identificador, a requisição é recusada com erro de requisição inválida (e o caso fica registrado para diagnóstico) — nada de id inventado.
2. **Evento repetido não processa duas vezes.** O identificador é único por provedor: reenvio do mesmo evento é aceito com "já recebido" e ignorado.
3. **Um trabalhador por provedor** roda de minuto em minuto, pega um lote de eventos pendentes com reserva exclusiva (dois trabalhadores nunca pegam o mesmo evento) e executa a lógica de negócio: faturas/assinaturas no Asaas, sincronização de contas no Pluggy.
4. **Tentativas com espera crescente.** Falha temporária volta para a fila com espera progressiva (1, 2, 4, 8, 16 min) até 5 tentativas. Evento reservado por um trabalhador que morreu volta sozinho para a fila quando a reserva expira.
5. **Dead letter.** Depois da última tentativa o evento vai para "dead letter" com o erro registrado, sai da fila e aparece no painel administrativo, com ação de reenfileirar manualmente.
6. **`transactions/deleted`** passa a ser tratado: lançamentos removidos na origem que ainda estão no extrato a conciliar são descartados; os que já viraram lançamento no sistema são marcados como "revisar — removido na origem", sem apagar nada automaticamente.
7. **Fila do Pluggy destravada:** todos os 287 eventos parados entram como pendentes e são processados pelo trabalhador (com lote limitado por rodada, para não gerar uma avalanche de sincronizações).
8. **Monitoramento:** o painel administrativo do Pluggy/Asaas mostra pendentes, em processamento, tentando de novo e dead letter, com o erro do último evento.

## Detalhes técnicos

**Banco (uma fila por provedor, conforme decidido)**

Em `asaas_webhook_events` e `pluggy_webhook_events`, mesmas colunas de fila:
`status text NOT NULL DEFAULT 'pending'` (`pending|processing|processed|retry|dead_letter`), `attempt_count int NOT NULL DEFAULT 0`, `max_attempts int NOT NULL DEFAULT 5`, `next_attempt_at timestamptz NOT NULL DEFAULT now()`, `locked_by text`, `claim_expires_at timestamptz`, `dead_lettered_at timestamptz`, `error_code text`, `updated_at`.
- `pluggy_webhook_events.event_id` passa a `NOT NULL` (linhas legadas sem id recebem `legacy:<uuid>`); índice único já existe nas duas tabelas.
- Índices parciais: `(status, next_attempt_at)` e `(claim_expires_at) WHERE status='processing'`.
- Backfill: `processed_at IS NOT NULL` → `processed`; o resto → `pending` com `next_attempt_at = now()`.
- RPCs `SECURITY DEFINER`, `search_path=public`, `REVOKE` de `anon`/`authenticated`, `GRANT EXECUTE` só para `service_role`:
  - `asaas_webhook_claim(_worker text, _batch int, _lease_seconds int)` e `pluggy_webhook_claim(...)` — `FOR UPDATE SKIP LOCKED`, pegam `pending`/`retry` com `next_attempt_at <= now()` mais os `processing` com lease expirado, marcam `processing`, incrementam `attempt_count`.
  - `*_webhook_finalize_success(_event_id uuid, _worker text)` — só finaliza se o lease ainda for do worker.
  - `*_webhook_finalize_failure(_event_id uuid, _worker text, _error text, _error_code text)` — recoloca em `retry` com backoff exponencial ou em `dead_letter` no limite.
  - `*_webhook_requeue(_event_id uuid)` — reenfileira dead letter (usada pelo painel via edge function admin).
  - Recriar as funções `pluggy_webhook_finalize_*` órfãs com a assinatura nova (drop + create).

**Edge functions**
- `asaas-webhook` e `pluggy-webhook`: viram apenas validação de segredo + `eventId` obrigatório + insert idempotente (`on conflict do nothing`) + `200`. Toda a lógica atual do Asaas é movida para o worker; a chamada inline de `pluggy-sync-item` sai do webhook.
- Novas `asaas-webhook-worker` e `pluggy-webhook-worker` (`verify_jwt=false`, protegidas por header secreto, mesmo padrão de `close-credit-card-invoices`): claim de lote (25), processamento sequencial por evento, finalize success/failure por evento, limite de tempo por rodada e resumo no retorno. Erro em um evento não derruba o lote.
- `pluggy-webhook-worker` amplia a lista de eventos: além dos atuais, `transactions/deleted` (descarta staging correspondente por `pluggy_transaction_id`, marca `needs_review` em `transactions` já confirmadas), `item/deleted` e `item/error` (marca conexão e não fica retentando à toa — erro de credencial vai direto para dead letter com código próprio).
- Agendamento: dois `cron.schedule` de 1 minuto chamando os workers; auditar e remover os crons antigos que apontam para funções inexistentes no repositório (`pluggy-webhook-drain`, `pluggy-worker`, `pluggy-v2-worker`, `pluggy-sync`, `pluggy-remote-delete-worker`, `pluggy-consent-notifier`, `pluggy-v2-alerts`) — conferindo antes se cada uma existe no ambiente publicado.

**Frontend**
- `src/pages/admin/PluggyWebhook.tsx` e o painel de webhooks Asaas: colunas de status/tentativas/último erro, filtro por status e botão "reenfileirar" para dead letter.
- Conciliação: badge "removido na origem" nas linhas afetadas por `transactions/deleted`.

**Congelamento**
- `.lovable/release-freeze.json` volta para `frozen: false` (descongelamento autorizado), com nota no runbook `docs/runbooks/release-freeze.md`.

**Testes**
- `supabase/tests/pluggy_webhook_worker_concurrency.sql`: atualizar para a tabela e o claim reais (hoje aponta para `open_finance_webhook_events`, que não existe mais) e cobrir claim sem overlap, lease expirado, backoff e dead letter — para os dois provedores.
- Teste Deno em cada worker para autenticação por segredo e para o roteamento de `transactions/deleted`.
- Teste de privilégio: `authenticated` não executa nenhuma das RPCs novas.

## Verificação
- Rodar o worker do Pluggy e acompanhar a fila cair de 287 pendentes a zero, sem duplicar lançamento.
- Reenviar um evento repetido e confirmar resposta "já recebido" sem novo processamento.
- Forçar falha (item inválido) e conferir as 5 tentativas com espera crescente e a ida para dead letter.
- Enviar webhook sem identificador de evento e conferir recusa com erro de requisição inválida.
