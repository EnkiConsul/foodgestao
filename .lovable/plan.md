
# Integração Open Finance — Pluggy (360°FOOD)

Integração empresarial (context = pj) do zero, seguindo o PROMPT DEFINITIVO anexado e a documentação oficial da Pluggy (Connect Token + Pluggy Connect widget + Items + Transactions V2 + Webhooks + Consents). O callback `onSuccess` do widget **não** é fonte de verdade — a fonte de verdade é webhook + `GET /items/{itemId}`.

## Princípios inegociáveis
- **Idempotência** por `eventId`, `provider_transaction_id`, `provider_item_id`.
- **Atomicidade por lote** (até 500 transações por commit).
- **Nenhuma exclusão física** — usar `status=cancelado` / `is_active=false`.
- **Zero dupla contagem** — compra vs. pagamento de fatura, transferência própria, estorno.
- **Multiempresa estrito** — RLS por `company_id`, sem persistir direito ao criador da conexão.
- **Secrets somente no backend** (`PLUGGY_CLIENT_ID/SECRET/WEBHOOK_SECRET/API_BASE_URL`, `APP_PUBLIC_URL`). Nunca `VITE_*`.

## Ordem de entrega (9 blocos)

### Bloco 1 — Auditoria (antes de qualquer código)
Levantar em `supabase/migrations`, `functions`, `types.ts`, `src/lib/credit-card/cycle.ts`, `src/lib/relatorios/fluxoCaixa.ts`, `recompute_account_balance`, `get_balance_before`, `signedEffect`, `pay_credit_card_invoice`, `dre_generate`, `dre_publish_snapshot`, `enqueue_uncategorized_for_ai`. Documentar escopo (consolidado vs. por conta) e concluir `Alteração necessária: nenhuma` onde couber. **Não** alterar essas funções sem evidência.

### Bloco 2 — Modelo de dados + RLS + RPCs + Locks
Migrations criando (com RLS desde o nascimento):
- `open_finance_connection_requests` (solicitação opaca — id vira `clientUserId`).
- `open_finance_connections` (unique `(provider, provider_item_id)`, campos de lock `sync_lock_token/locked_at/locked_until/locked_by`).
- `open_finance_accounts` (unique `(connection_id, provider_account_id)`, `ownership_status`, `owner_document_hash/last4`, vínculo para `accounts.id` ou `credit_cards.id`).
- `open_finance_consents`.
- `open_finance_transactions_raw` (staging; unique `(connection_id, provider_transaction_id)`, `mapping_status`).
- `open_finance_webhook_events` (unique `(provider, event_id)`, service_role only).
- `open_finance_sync_runs`.
- Colunas adicionais em `transactions`: `connection_account_id`, `provider_status/category`, `counterparty_name/cnpj/document_hash/last4`, `payment_method_provider`, `needs_review`, `review_reason`, `pairing_status/started_at/expires_at`, `exclude_from_results`, `canceled_at`, `cancel_reason`, `superseded_by_transaction_id`, `provider_last_updated_at`. Índices únicos por `(connection_account_id, external_id)` e por `(company_id, counterparty_cnpj)`.
- RPCs: `claim_open_finance_sync`, `release_open_finance_sync`, `ingest_of_transaction` (upsert idempotente com proteção contra ressurreição), `promote_to_transfer`, `pair_retro_transfers`, `expire_transfer_candidates`.
- GRANTs padrão (authenticated para leitura financeira; service_role para staging/webhook).

### Bloco 3 — Cliente Pluggy backend
`supabase/functions/_shared/pluggy-client.ts` com `authenticate`, `createConnectToken`, `getItem`, `updateItem`, `deleteItem`, `listAccounts`, `listConsents`, `listBills`, `iterateTransactionsV2` (paginação por `after`, `ids` até 500, `dateFrom` **ou** `createdAtFrom`). Retry com backoff, sem log de secrets.

Edge Functions:
- `pluggy-create-connect-token` (verify_jwt=true): valida JWT, empresa, membership, permissão financeira, módulo, plano, limite → cria `connection_request` → token com `clientUserId=request.id` + `avoidDuplicates` + `itemId` apenas para update.
- `pluggy-delete-item` (verify_jwt=true): valida owner/admin → `DELETE /items/{id}` → marca conexão inativa; preserva histórico.

### Bloco 4 — Webhook global + Worker
- `pluggy-webhook` (`verify_jwt=false`, segredo por header, nunca query): valida assinatura → insere evento (duplicado = 200) → responde 200 imediatamente → enfileira.
- `pluggy-process-events`: `claim` atômico, `processing` com incremento de tentativas, retries com backoff, recuperação de eventos abandonados (`processing` > N min → volta a `pending`), classificação de erros temporários x permanentes.

### Bloco 5 — Widget Pluggy Connect no frontend
`src/pages/IntegracoesBancarias.tsx` + hook `usePluggyConnect`: chama `pluggy-create-connect-token`, abre widget oficial, trata `onSuccess/onError/onEvent` apenas como telemetria. Fluxos: **Conectar**, **Reconectar**, **Renovar consentimento** (mesmo Item — sem duplicar).

### Bloco 6 — Contas, cartões, faturas
- UI de vínculo `open_finance_accounts` → `accounts` (BANK) ou `credit_cards` (CREDIT).
- Titularidade (`ownership_status`) obrigatória antes de habilitar `auto_import`.
- **Bills disponível**: sincroniza `credit_card_invoices` (fechamento, vencimento, total, pagamentos).
- **Bills indisponível**: cai em `balanceCloseDate/balanceDueDate/billForecastDate` + `src/lib/credit-card/cycle.ts` — sem bloquear a integração.

### Bloco 7 — Ingestão de transações
- `iterateTransactionsV2` por conta, cursor incremental (`sync_cursor_created_at`), lotes ≤ 500, atomicidade por lote.
- Upsert idempotente em `transactions_raw` + mapeamento para `transactions` via `ingest_of_transaction` respeitando **proteção contra ressurreição** (não restaurar `status/transaction_type/amount_paid/payment_date` quando `status=cancelado` + `cancel_reason=Consolidado em transferência…`).
- BANK: sinal do `amount` → receita/despesa provisória; CREDIT: compra → despesa vinculada ao cartão + fatura; pagamento/estorno de cartão nunca vira receita operacional automaticamente.
- Detecção de **pagamento de fatura** reaproveita `pay_credit_card_invoice`.
- CPF apenas como hash + last4; CNPJ validado (14 dígitos + DV + tipo explícito).

### Bloco 8 — Transferências entre contas próprias
- Candidato pela primeira perna: `pairing_status=waiting`, `exclude_from_results=true`, janela de 5 dias a partir de `pairing_started_at`, badge "Aguardando confirmação da outra conta".
- Ao chegar o par: `promote_to_transfer` faz **UPDATE** da linha existente para `transaction_type=transferencia` + `destination_account_id`; segunda perna vai para `staging.mapping_status=ignored` **ou** se já materializada, é `status=cancelado` + `superseded_by_transaction_id`.
- `pair_retro_transfers` roda ao fim de cada sync run.
- `expire_transfer_candidates`: indícios fracos → finaliza como receita/despesa; indícios fortes → `needs_review=transferencia_sem_par_expirada`, mantém fora da DRE.
- Todas as fontes da DRE (`dre_generate`, chart_accounts_report, consultas consolidadas) filtram `exclude_from_results=true` **no backend**.
- `dre_publish_snapshot` bloqueia publicação quando existem provisórios, exigindo override auditado por owner/admin.

### Gate — só depois deste bloco começar o 9
Todos os testes de transferência, ressurreição, snapshot e DRE provisória do §45/§47 devem passar.

### Bloco 9 — Categorização automática + IA
Pipeline: regras exatas empresa → regras aprendidas → CNPJ → merchant → descrição → categoria Pluggy (apenas sinal, nunca gravada como `categories.id`) → forma de pagamento → conta/cartão → histórico → IA → revisão humana.
Reaproveita `categorization_rules`, `import_rules`, `enqueue_uncategorized_for_ai`, `categories.ai_description`. Confiança IA: ≥0.90 aplica; 0.70–0.89 sugere; <0.70 revisão. Aprendizado escopado por empresa.

## UI e identidade
Rota `Financeiro 360° → Contas Bancárias → Integrações Bancárias`. Cards por conexão com instituição, status, última sync, consentimento, contas/cartões, titularidade, pendências, erros. Ações: Conectar, Continuar autorização, Reconectar, Renovar consentimento, Vincular conta/cartão, Ativar/Desativar importação, Sincronizar, Desconectar. Design tokens existentes (navy #16273D, azul #1B3A63, laranja #E8611A, Poppins/Inter, shadcn/ui).

## Fila de revisão
Reason codes: `possivel_pagamento_fatura`, `possivel_transferencia_interna`, `transferencia_sem_par_expirada`, `estorno_sem_origem`, `titularidade_nao_confirmada`, `divergencia_cnpj_contraparte`, `transacao_removida_em_periodo_fechado`, `repasse_sem_taxa_identificada`, `categoria_com_baixa_confianca`. `aguardando_par_transferencia` **não** aparece na fila.

## Testes obrigatórios (Vitest + testes RLS/tenancy)
Transferência mesmo sync, pareamento tardio D+2, expiração fraco/forte, snapshot bloqueado sem override, ressurreição (9 replays), cartão compra vs. pagamento sem dupla despesa, isolamento multiempresa cross-tenant.

## Secrets a solicitar (via `add_secret` quando entrarmos no Bloco 3)
`PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET`, `PLUGGY_API_BASE_URL`, `APP_PUBLIC_URL`.

## Escopo desta fase
Fora: `acquirer_settlements`, motor de MDR, agenda de recebíveis, reconstrução de valor bruto — repasses sem taxa identificada vão para `needs_review=repasse_sem_taxa_identificada`.

## Detalhes técnicos-chave
- Todas as edge functions retornam corsHeaders + tratamento `FunctionsHttpError`.
- Webhook exige segredo em header; responde 200 mesmo em duplicado (após inserir/ignorar).
- Locks via `claim_open_finance_sync` (token + expiry); nada de advisory locks cobrindo a função inteira.
- `GET /v2/transactions` com `accountId` obrigatório, cursor `after`, sem misturar `createdAtFrom` e `dateFrom`.
- Nenhum payload bruto em `transactions` (fica em `transactions_raw`).

## Entrega
Sugestão de aprovação **bloco a bloco** — começando pelo Bloco 1 (auditoria escrita). Cada bloco só avança quando os critérios do anterior estiverem verdes.
