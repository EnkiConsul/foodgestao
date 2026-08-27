# Integridade Financeira — saldo bancário x razão, updates da Pluggy e conciliação

## O que foi verificado agora

- A coluna `accounts.current_balance` tem hoje **dois donos**: o motor do razão (trigger `apply_tx_balance`, alimentado pelos lançamentos confirmados) e o Open Finance, que sobrescreve o valor via `sync_of_account_balance` (a função liga a flag `app.balance_engine` só para poder gravar direto). Não existe coluna separada com o saldo informado pelo banco.
- Já existe detecção de divergência (`balance_drift_snapshots`, `report_balance_drift`, tela `/admin/drift-saldos`). Rodando o cálculo agora, nenhuma conta está divergente — ou seja, ainda não há dano acumulado, mas a arquitetura permite que o saldo do banco apague silenciosamente o saldo do razão.
- `transactions/updated` da Pluggy é tratado disparando um sync do item, e o sync busca **sempre os últimos 30 dias** (janela fixa no código). Uma alteração em lançamento mais antigo nunca é reprocessada. Não há caminho de backfill no fluxo V1 (só o `fullSync` do V2 na primeira conexão).
- Quando o banco muda a versão de um lançamento **já conciliado**, o sync grava a nova versão como `duplicate` e não toca no lançamento confirmado nem avisa ninguém. Hoje: 85 linhas conciliadas, 1.139 pendentes, 0 duplicadas.
- As RPCs de confirmação (`pluggy_confirm_staging`, `_split`, `_card`, `_transfer`) só aceitam staging com `status = 'pending'` e criam lançamento novo — não sobrescrevem lançamento existente. Falta a garantia simétrica: nada fora delas deve alterar lançamento confirmado vindo do Open Finance sem registro.

## Aviso de freeze

A `main` está congelada (`.lovable/release-freeze.json`). Este bloco é de integridade financeira e será tratado como hotfix aprovado, na mesma linha dos P0 anteriores — sem mudanças de escopo além do descrito aqui.

## O que será feito

### 1. Separar saldo do banco do saldo do razão
- Novas colunas em `accounts`: `bank_balance`, `bank_balance_at`, `bank_balance_source`.
- `sync_of_account_balance` passa a gravar **apenas** essas colunas; `current_balance` volta a ser exclusividade do razão (trigger). Na primeira vinculação de uma conta nova (razão vazio) o saldo do banco continua semeando `initial_balance`, para não zerar contas recém-conectadas.
- Telas de contas bancárias e dashboard passam a mostrar o saldo do razão como valor oficial e o saldo do banco como referência, com aviso quando os dois diferem além de 1 centavo.
- O scan de divergência passa a comparar razão x `bank_balance` (em vez de comparar a coluna consigo mesma) e roda diariamente.

### 2. Reprocessar corretamente `transactions/updated`
- A janela do sync deixa de ser fixa: o worker passa a informar a janela necessária, e eventos de atualização usam janela ampliada (padrão 90 dias, configurável).
- Novo backfill sob demanda por conexão/conta com intervalo de datas, disparável na tela de Open Finance (importa só o que falta, idempotente por `pluggy_transaction_id`/`provider_id`).

### 3. Conciliação nunca altera lançamento confirmado em silêncio
- Quando o banco muda valor/data/descrição de uma linha já conciliada, o lançamento correspondente recebe `needs_review` com motivo `alterado_na_origem`, guardando a versão anterior e a nova.
- A linha divergente aparece em uma faixa "Revisar" na conciliação e no Extrato de Conciliação, com ações explícitas: aceitar a nova versão (gera ajuste com histórico) ou manter a atual.
- Regra de banco: lançamento com `status = 'confirmado'` e origem Open Finance só pode ter valor/data alterados por caminho auditado (RPC dedicada que grava histórico); atualizações diretas são bloqueadas.

### 4. Testes
- Unitários do modelo de divergência de saldo (razão x banco) e da regra de "alterado na origem".
- Teste SQL da RPC de aceite/rejeição da nova versão e do bloqueio de alteração direta de lançamento confirmado.

## Detalhes técnicos

- Migração única: colunas de saldo bancário + reescrita de `sync_of_account_balance` + `report_balance_drift` + trigger de proteção de lançamento confirmado + RPC `pluggy_apply_origin_change`.
- Edge functions afetadas: `pluggy-sync-item` (janela parametrizada, detecção de mudança em linha conciliada, backfill), `pluggy-webhook-worker` (janela por tipo de evento).
- Frontend: `ContasBancarias.tsx`, `Dashboard.tsx`, `ConciliacaoPluggy.tsx`, `ExtratoConciliacao.tsx`, `src/lib/conciliacao/` e `src/lib/transactions/balance.ts` (helper de comparação razão x banco).
