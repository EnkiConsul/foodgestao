
# Plano — Lançamento "Parcelado"

## Decisão de arquitetura

Adicionar `parcelado` como novo valor do enum `transaction_type` (conforme escolhido) e um campo auxiliar `parcel_direction` (`entrada` | `saida`) para preservar o efeito no saldo. As colunas `installment_number`, `installment_total` e `parent_transaction_id` **já existem** na tabela `transactions` e serão reutilizadas.

Um lançamento parcelado é modelado assim:
- 1 **parent** (`transaction_type='parcelado'`, `installment_number=NULL`, `installment_total=N`, `status='cancelado'` — serve só de âncora, não afeta saldo).
- N **parcelas filhas** (`transaction_type='parcelado'`, `installment_number=1..N`, `installment_total=N`, `parent_transaction_id=parent.id`, cada uma com seu `due_date`/`transaction_date`).
- Todas herdam `parcel_direction` — usada em toda regra de sinal/cor/DRE como se fosse `receita` (entrada) ou `despesa` (saída).

Escopo de edição/exclusão reutiliza o diálogo existente do Recorrente (`single | forward | all`) já aplicado a `parent_transaction_id`.

## Passo 1 — Banco (migração única)

1. `ALTER TYPE transaction_type ADD VALUE 'parcelado';`
2. `CREATE TYPE parcel_direction AS ENUM ('entrada','saida');`
3. `ALTER TABLE transactions ADD COLUMN parcel_direction parcel_direction;`
4. Trigger de validação: quando `transaction_type='parcelado'`, `parcel_direction` é obrigatório e `installment_total >= 2`; parcelas filhas devem ter `installment_number` entre 1 e `installment_total`.
5. Atualizar funções SQL existentes que somam saldo/relatórios e hoje só olham `receita`/`despesa` (varreremos `pg_proc` — candidatos conhecidos: `get_dashboard_summary`, `get_cashflow_projection`, `recalculate_account_balance`, e triggers de `accounts.current_balance`). Cada uma passa a tratar `parcelado + entrada` como receita e `parcelado + saida` como despesa. O parent (`installment_number IS NULL`) é ignorado nos somatórios.
6. Índice: `CREATE INDEX ON transactions(parent_transaction_id) WHERE transaction_type='parcelado';`

## Passo 2 — Formulário (`TransactionFormDialog.tsx`)

- Nova aba "Parcelado" no `Tabs` de tipo (ao lado de Receita/Despesa/Transferência), ícone `CreditCard`.
- Ao selecionar, revela um bloco com:
  - `parcel_direction` (radio Entrada/Saída),
  - `installment_total` (número, 2–360),
  - Modo do valor (toggle **Total ↔ Por parcela**),
  - Periodicidade (reusa `recurrence_type`: mensal/quinzenal/…),
  - Data da 1ª parcela (`transaction_date` + `due_date`),
  - Preview: tabela "Parcela 1/N — R$ x — 15/08", última parcela absorve centavos residuais quando modo=Total.
- No submit, em vez do insert atual, faz insert do parent + `installment_total` filhos em uma única chamada (`.insert([...])`). Categoria/conta/contato/forma-de-pgto herdadas.
- Categorias no `filteredCategories`: quando `type==='parcelado'`, filtrar por `transaction_type === (parcel_direction==='entrada' ? 'receita' : 'despesa')`.

## Passo 3 — Utilitário de sinal

`src/lib/transaction-sign.ts` — `transactionSignedAmount` passa a considerar `parcel_direction` quando `transaction_type==='parcelado'` (entrada → `+amount`, saida → `-amount`). Todos os `text-success`/`text-destructive` do app usam esse helper, então cores e sinais ficam corretos automaticamente.

## Passo 4 — Telas e agregações que somam por tipo

Ajustar as ramificações `if (t.transaction_type === 'receita' | 'despesa')` para também aceitar `parcelado` respeitando `parcel_direction`:

- `src/pages/Dashboard.tsx` (linhas ~154/159) — somatórios de receitas/despesas do mês.
- `src/pages/FluxoCaixa.tsx` (linhas ~138/149) — realizado + projeção.
- `src/pages/Lancamentos.tsx` — filtros Crédito/Débito/Transferência ganham novo chip "Parcelado" (ou marcam parcelado dentro de Crédito/Débito conforme `parcel_direction`); `.select` inclui `parcel_direction, installment_number, installment_total`.
- `src/components/relatorios/contabeis/DreReport.tsx` + `useContabeisReport` — parcelas entram no DRE conforme direção.
- `src/pages/Orcamento.tsx` e `BudgetFormDialog` — orçamento continua sendo por categoria; parcelas contam normalmente.
- `PaymentDialog` — aceitar `parcel_direction` como equivalente ao tipo receita/despesa para baixa/pagamento.
- `NotificationsBell` — alertas de vencimento tratam parcelas como vencimentos comuns.
- `ImportStatementDialog` / `nubankPdf` / `statement-import/types` — **fora de escopo** (extrato bancário não gera parcelado; permanecem receita/despesa).

## Passo 5 — Validação Zod

`src/lib/validations.ts` — `transactionSchema.transaction_type` recebe `'parcelado'` e novo campo opcional `parcel_direction` obrigatório quando type=parcelado; `installment_total >= 2`.

## Passo 6 — Categorias

Categorias continuam com `receita`/`despesa` — parcelado reaproveita as existentes conforme direção. Sem migração de dados.

## Passo 7 — Escopo de edição/exclusão

Reutilizar o `RecurrenceScopeDialog` (`single | forward | all`) do fluxo de recorrência, apontando para `parent_transaction_id`. Ao editar valor/categoria em modo "todas", recalcular parcelas restantes (mesma lógica do modo Total do formulário).

## Passo 8 — Impactos não-óbvios (verificar/ajustar)

- `useContabeisReport` (RPC de contabilidade) — checar SQL do relatório.
- `Buscar.tsx` — badge do tipo precisa suportar "Parcelado".
- `TransactionFormDialog` duplicação — ao duplicar uma parcela filha, criar como lançamento novo simples (não regerar série).
- Realtime de `accounts.current_balance` — depende dos triggers ajustados no Passo 1.

## Passo 9 — Testes de fumaça manual

1. Criar parcelado 12× total R$ 1.200 → 12 filhas de R$ 100, saldo do mês corrente muda em -R$ 100.
2. Alterar 1 parcela (escopo "esta") → só ela muda; "todas" recalcula série.
3. Excluir "todas" → apaga parent + filhas.
4. Dashboard, DRE, Fluxo de Caixa refletem parcelas corretamente.
5. Categoria filtrada por direção correta.

## Nota técnica

`ALTER TYPE ... ADD VALUE` não pode rodar dentro de transação com uso do valor na mesma migração no Postgres — a migração dividirá `ADD VALUE` do restante em blocos separados (Supabase aceita), ou usaremos `CREATE TYPE novo + ALTER COLUMN` se necessário. Confirmarei na hora de escrever a migration.
