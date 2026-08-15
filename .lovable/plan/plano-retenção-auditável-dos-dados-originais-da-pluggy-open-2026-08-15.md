# Plano — Retenção auditável dos dados originais da Pluggy (Open Finance)

## Objetivo
Garantir que todo lançamento vindo da Pluggy/Open Finance mantenha, no banco de dados, uma cópia imutável e rastreável dos dados originais para conferência futura, auditoria e análise forense.

## Situação atual
- `pluggy_staging_transactions.raw` (JSONB) armazena o payload original enquanto o lançamento está em conciliação.
- `pluggy_webhook_events.payload` (JSONB) guarda os eventos brutos recebidos da Pluggy.
- Após a confirmação, `pluggy_confirm_staging` cria o registro em `transactions`, mas **não copia o `raw` nem guarda o `pluggy_transaction_id` ou `pluggy_staging_transaction_id`** na tabela `transactions`.
- As tabelas V2 (`pluggy_v2_*`) existem no código de materialização (`pluggy-v2-materialize.ts`), mas **não foram criadas no banco**.

## Entregáveis

### 1. Banco de dados — schema e RLS
- Criar `pluggy_v2_transactions_raw` com campos:
  - `id`, `company_id`, `connection_id`, `account_id` → `pluggy_v2_accounts`
  - `pluggy_transaction_id`, `pluggy_account_id`, `provider_id`
  - `amount`, `currency_code`, `description`, `description_raw`, `category`, `category_id`, `type`, `status`, `date`, `balance`, `merchant`, `payment_data`, `raw` (JSONB)
  - `created_at`, `updated_at`
- Criar `pluggy_v2_connections` e `pluggy_v2_accounts` se ainda não existirem (o código já espera essas tabelas).
- Criar `pluggy_v2_sync_runs` para acompanhar cada execução de sync.
- Adicionar em `transactions`:
  - `pluggy_staging_transaction_id` (UUID, FK para `pluggy_staging_transactions`)
  - `pluggy_transaction_id` (TEXT)
  - `pluggy_raw_snapshot` (JSONB)
- Criar índices únicos: `pluggy_v2_transactions_raw (pluggy_transaction_id)`.
- RLS: `pluggy_v2_*` acessível somente a membros da empresa; staging/webhook acessível como hoje; exclusão permitida apenas a `admin`/`super_admin` com `audit_logs`.
- GRANTs: `authenticated` SELECT, `service_role` ALL.

### 2. Materialização V2
- Ativar o materializador `materializePluggyItemV2` em um Edge Function (`pluggy-v2-materialize` ou dentro do worker existente).
- Alimentar `pluggy_v2_transactions_raw` com o payload completo da API `/v2/transactions`.
- Continuar populando `pluggy_staging_transactions` a partir do raw, para não quebrar a tela de conciliação atual.

### 3. Confirmação com rastreio
- Alterar `pluggy_confirm_staging` para:
  - Inserir em `transactions` com `pluggy_staging_transaction_id`, `pluggy_transaction_id` e `pluggy_raw_snapshot` copiado do `raw` da staging.
  - Manter a FK `matched_transaction_id` para compatibilidade.
- Fazer o mesmo em `pluggy_confirm_staging_transfer`.

### 4. Retenção e auditoria
- Política de retenção: nenhuma remoção automática de raw por 5 anos.
- Trigger/edge function de arquivamento: movimentações com mais de 5 anos podem ser movidas para tabela de arquivo frio (`pluggy_v2_transactions_raw_archive`) com log em `audit_logs`.
- `audit_logs` em toda exclusão manual de raw ou alteração de vínculo Pluggy.

### 5. Interface de auditoria (fase 1 mínima)
- Nova tela `/contas-bancarias/conciliacao/auditoria` ou modal dentro de `/conciliacao`.
- Lista lançamentos confirmados vindos da Pluggy com link para visualizar o JSON original (`pluggy_raw_snapshot`).
- Filtros: conta, data, status, texto na descrição.
- Botão "Ver original" abre visualização formatada do JSON (somente leitura).

### 6. Testes
- Testes unitários para garantir que `pluggy_confirm_staging` copia `pluggy_raw_snapshot`.
- Testes de RLS para `pluggy_v2_transactions_raw`.
- Teste de retenção: exclusão manual gera `audit_logs`.

## Critérios de aceitação
1. Cada transação confirmada da Pluggy possui `pluggy_transaction_id` e `pluggy_raw_snapshot` preenchidos.
2. A tabela `pluggy_v2_transactions_raw` contém todos os lançamentos sincronizados, mesmo os que nunca foram confirmados.
3. Somente usuários autorizados da empresa podem ler o raw; exclusão só por admin e sempre auditada.
4. A tela de auditoria permite visualizar o JSON original de qualquer lançamento Pluggy confirmado.

## Notas de risco
- A mudança no schema de `transactions` é retrocompatível (colunas nullable).
- A ativação da materialização V2 não deve desabilitar a V1 até que a tela de conciliação seja migrada.
- Volume de raw JSON pode crescer rapidamente; monitorar tamanho da tabela após 1.000 lançamentos.
