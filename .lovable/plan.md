## Objetivo

Reconstruir a integração Open Finance com Pluggy do zero e, sobre uma base estável, entregar a nova UX de cadastro de contas (modal de escolha, wizard, cards e central de conciliação) definida no prompt.

A execução é sequencial por blocos. Cada bloco termina com relatório (arquivos, migrations, RPCs, testes, pendências) e só avanço ao próximo após sua aprovação.

## Diagnóstico atual (Bloco 1 já validado agora)

Verifiquei o estado do projeto após a remoção anterior:

- `src/pages/OpenFinance.tsx` — não existe.
- `src/hooks/useOpenFinance*` — não existe.
- `src/components/open-finance/` — pasta inexistente (sem `PluggyConnectLauncher`, sem `AccountMappingDialog`).
- `supabase/functions/pluggy-*` — nenhuma edge function Pluggy no repo.
- `src/pages/ContasBancarias.tsx` — existe, sem menções a Open Finance.
- `src/components/accounts/AccountFormDialog.tsx` — existe; hoje já força escolha PF/PJ livre e edita saldo atual diretamente (linhas 197–217, 262–277). Ambos precisam ser ajustados no Bloco 3.
- `src/components/transactions/ImportStatementDialog.tsx` — existe e será a base do fluxo de importação, com parser desacoplado do Nubank.
- Tabelas `accounts`, `transactions`, `companies`, `company_members` presentes com RLS. Tabelas `open_finance_*` e RPC `link_open_finance_account` **não existem mais** (foram dropadas). Precisam ser recriadas.

Consequência: o §3 "Gate técnico" do prompt não pode ser cumprido sobre o que existe — a integração precisa ser reconstruída antes da nova UX.

## Escopo do Pluggy (aderente ao §11 "fora do escopo")

- Somente leitura (Accounts, Transactions, Identity, Bills quando disponível).
- Sem iniciação de pagamentos, sem recebíveis, sem adquirentes, sem MDR.
- Instituições limitadas às suportadas pela Pluggy.
- Período de importação mantém a janela atual do produto.

## Blocos e entregas

### Bloco 2 — Base de dados + RPCs Open Finance
- Migration única criando:
  - `open_finance_connections` (item Pluggy, `company_id`, `status`, `consent_expires_at`, `connected_by_user_id`, `last_synced_at`).
  - `open_finance_accounts` (`connection_id`, `pluggy_account_id`, `local_account_id`, `auto_import`, `type`, `balance`, `institution`).
  - `open_finance_connection_requests` (fluxo de autorização assíncrona: `connect_token`, `status`, `error`).
  - `open_finance_transactions_raw` (payload cru + `import_hash` idempotente).
  - `open_finance_sync_runs` (worker/webhook: `status`, `started_at`, `finished_at`, `error`).
  - `open_finance_webhook_events` (auditoria e replay).
- GRANTs restritivos: staging (`_raw`, `_webhook_events`, `_sync_runs`) só para `service_role`; leitura de conexões/contas para membros da empresa via RLS.
- RLS por `company_id` usando `company_members`; nenhum acesso cross-tenant.
- RPCs SECURITY DEFINER:
  - `claim_open_finance_sync`, `release_open_finance_sync` — locking do worker.
  - `ingest_of_transaction` — insere em `transactions` sem duplicar, respeitando `is_invoice_payment`.
  - `link_open_finance_account(connection_id, pluggy_account_id, local_account_id, auto_import)` — vínculo idempotente, sem `owner_id`.
  - `create_and_link_open_finance_account(...)` — cria `accounts` + vincula + audita atomicamente.
- Extensão de `transactions` com colunas nullable retro-compatíveis (`open_finance_account_id`, `import_hash`, `categorization_source`, `exclude_from_results`).
- Sem alteração em `dre_generate`, `recompute_account_balance`, `pay_credit_card_invoice`, `signedEffect`.

### Bloco 3 — Cliente Pluggy + Edge Functions
- `supabase/functions/_shared/pluggy-client.ts` no padrão do `_shared/zapi.ts` (retry exponencial, `safePluggyError`, timeouts).
- Secrets `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` via `add_secret` (não coloco no código, não uso `VITE_PLUGGY_*`).
- Edge Functions (todas com `verify_jwt` em código usando `getClaims`):
  - `pluggy-connect-token` — emite token do widget para o usuário logado da empresa.
  - `pluggy-item-register` — persiste item retornado pelo widget (não depende só do callback).
  - `pluggy-sync` — worker: busca contas + transações + bills e chama `ingest_of_transaction`.
  - `pluggy-webhook` — recebe `item/updated`, `item/error`, `transactions/created`, enfileira sync.
  - `pluggy-consent-notifier` — cron de expiração de consentimento (template já existe no Resend).
- Job cron para o worker; idempotência por `import_hash` e `open_finance_webhook_events`.

### Bloco 4 — Modal de escolha (§4) e cards de estados (§8)
- Novo `src/components/accounts/AccountCreationMethodDialog.tsx` com dois cards (Open Finance "Recomendado" / Manual).
- `ContasBancarias.tsx`: botão "Nova Conta" abre o novo modal, não o form direto.
- Cards de conta mostrando origem, instituição, última sync, e um dos estados: Manual, Conectado, Sincronizando, Aguardando autorização, Aguardando vínculo, Reconexão necessária, Importação desativada, Desconectado.

### Bloco 5 — Fluxo Manual reforçado (§6)
- `AccountFormDialog` refatorado:
  - Remove escolha livre PF/outra empresa; conta pertence à empresa ativa (contexto atual).
  - Adiciona "Data de referência do saldo" e flag "Conta padrão".
  - Após salvar, prompt: "Importar extrato" ou "Começar sem extrato".
- Interface intermediária `StatementParser` desacoplando `nubankParser` do fluxo, para futuros parsers.
- "Começar sem extrato" pede data inicial, saldo anterior e observação (gera lançamento de saldo inicial auditável).

### Bloco 6 — Wizard Open Finance (§5)
- `src/components/open-finance/OpenFinanceAccountWizard.tsx` em tela ampla com etapas: Como funciona → Conexão → Processamento → Contas encontradas → Configuração → Importação → Conclusão.
- Reutiliza `PluggyConnectLauncher` (recriado no Bloco 3 como wrapper leve).
- Estados reais lidos de `open_finance_connection_requests` e `open_finance_connections`; usuário pode fechar e voltar sem perder progresso.
- Etapa "Contas encontradas": criar local, vincular existente, ignorar, ativar importação — todas via `create_and_link_open_finance_account` / `link_open_finance_account`.
- Conclusão exibe totais reais (lançamentos, categorizados, pendentes, transferências, duplicidades) + CTAs "Revisar conciliação" / "Revisar depois".

### Bloco 7 — Central de Conciliação (§7)
- Rota `/contas-bancarias/:accountId/conciliacao` ("Conciliação e Categorização").
- Cabeçalho com saldo bancário vs sistema, diferença, última sincronização, pendências.
- Abas: Pendentes, Movimentações, Sugestões da IA, Sem categoria, Transferências, Duplicidades, Divergências, Conciliados, Arquivados.
- Ações: criar lançamento, vincular existente, criar transferência, marcar pagamento de fatura (`pay_credit_card_invoice`), arquivar/ignorar, ações em lote com validação backend.
- IA reaproveita motor atual (`ai-categorize-transactions`, `categorization_rules`), com botão "Criar regra".

### Bloco 8 — Exclusão, saldo, permissões (§9, §10) + testes (§12)
- `accounts`: bloqueia delete físico quando há transações ou vínculo OF; adiciona ações Desativar / Arquivar / Desconectar / Desativar importação.
- Contas conectadas: saldo atual não é editável; "Ajustar saldo" cria transação auditável.
- Permissões via `useCompanyPermissions`: `financeiro.accounts.create/edit`, `financeiro.open_finance.connect/link_account/disconnect`, `financeiro.reconciliation.manage`, validadas também nas edge functions.
- Testes:
  - Unit: parser desacoplado, wizard reducer, formatação de estados.
  - RLS/tenancy: `open_finance_*` cross-tenant, worker service-role.
  - E2E (Playwright headless) dos fluxos: manual, manual+import, sem extrato, OF conexão, autorização assíncrona, saída durante processamento, duas contas no mesmo banco, vincular existente, ignorar, prevenção de duplicidade, toggle importação, ajuste de saldo, soft delete, sem permissão.
  - Build + `tsgo` + security lint + CI.

## Detalhes técnicos

- Nada de secrets client-side (sem `VITE_PLUGGY_*`).
- Toda escrita passa por edge function autenticada (`getClaims`) validando `company_members`.
- `ingest_of_transaction` usa `on conflict (company_id, import_hash) do nothing` para idempotência.
- `open_finance_webhook_events` grava `signature`, `payload`, `processed_at` — replay seguro.
- Nenhuma mudança em DRE, `signedEffect`, `belongsToRegime`, `pay_credit_card_invoice`, `recompute_account_balance` além de leitura filtrada por `exclude_from_results=false` nos call-sites (Bloco 8 do prompt original), sem tocar nas funções.
- Types Supabase regenerados só depois que cada migration for aprovada.

## Fora deste plano

- Novos produtos Pluggy (pagamentos, recebíveis, MDR).
- Novos endpoints bancários fora da Pluggy.
- Mudança na DRE, regras de transferência ou janela de importação.

## Próximo passo

Aprovar este plano libera o **Bloco 2 (base de dados + RPCs)**. Só executo esse bloco; ao final apresento o relatório e aguardo aprovação para o Bloco 3.
