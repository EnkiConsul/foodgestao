
# Plano: Unificar Tudo na Tabela `transactions` e Eliminar a Tabela `bills`

## Objetivo
Eliminar a distinção entre "lançamento" e "conta a pagar/receber". Todo registro financeiro passa a ser uma **transaction** com campos adicionais que permitem controle de vencimento, pagamentos parciais e status de pagamento.

---

## 1. Migrar o Banco de Dados

Adicionar colunas na tabela `transactions` para absorver as funcionalidades de `bills`:

- `due_date` (date, nullable) -- data de vencimento (se preenchida, indica compromisso futuro)
- `amount_paid` (numeric, default 0) -- valor ja pago (para pagamentos parciais)
- `payment_date` (date, nullable) -- data do ultimo pagamento
- `bill_status` (enum bill_status, nullable) -- em_dia / vence_em_breve / atrasado / pago / parcial
- `contact_id` ja existe na tabela

Migrar dados existentes da tabela `bills` para `transactions` via SQL (INSERT INTO transactions SELECT ... FROM bills).

Manter a tabela `bills` no banco temporariamente (sem uso no codigo), para seguranca. Pode ser removida depois.

---

## 2. Atualizar o Formulario de Lancamento (`TransactionFormDialog`)

- Adicionar campo opcional **"Data de vencimento"** (visivel para receita/despesa, nao para transferencia)
- Quando preenchido, o lancamento nasce com `bill_status = 'em_dia'` e `status = 'pendente'`
- Quando nao preenchido, comportamento atual (lancamento realizado imediato)
- Atualizar o schema de validacao (`transactionSchema`) para incluir `due_date`, `amount_paid`, `bill_status`

---

## 3. Refatorar a Pagina de Lancamentos (`Lancamentos.tsx`)

- Remover toda logica de fetch/exibicao da tabela `bills`
- Remover o tipo `Bill`, `UnifiedRow.rowType`, e a unificacao atual de duas fontes
- Fetch apenas de `transactions` (incluindo novos campos `due_date`, `amount_paid`, `bill_status`)
- Computar o `bill_status` dinamicamente (em_dia, vence_em_breve, atrasado, pago, parcial) baseado em `due_date` e `amount_paid`
- Manter colunas: Data, Descricao, D/C, Valor, Status, Vencimento, Saldo
- Manter cards de resumo: Receitas, Despesas, A Pagar, A Receber, Atrasadas (calculados a partir de transactions com due_date)
- Manter filtros unificados (status de pagamento, tipo, periodo)
- Remover botao "Nova Conta" -- tudo e criado pelo mesmo formulario
- O botao de pagamento parcial (icone $) aparece para transactions com `due_date` e `bill_status != 'pago'`

---

## 4. Adaptar o PaymentDialog

- Em vez de atualizar a tabela `bills`, atualizar a propria transaction:
  - Incrementar `amount_paid`
  - Atualizar `bill_status` (parcial ou pago)
  - Atualizar `payment_date`
- Manter a logica de atualizar o saldo da conta bancaria (`current_balance`)
- Remover a criacao de lancamento automatico (pois ja E o lancamento)

---

## 5. Atualizar FluxoCaixa

- Alterar a query de projecao para buscar `transactions` com `due_date IS NOT NULL` e `bill_status != 'pago'` em vez de buscar da tabela `bills`

---

## 6. Remover Arquivos/Codigo Obsoletos

- Remover `src/components/bills/BillFormDialog.tsx`
- Remover `src/components/bills/BillsTab.tsx`
- Remover import/uso do `BillFormDialog` em `Lancamentos.tsx`
- Remover `billSchema` de `src/lib/validations.ts`
- Atualizar RLS policies da tabela `transactions` se necessario (nenhuma mudanca esperada, pois as policies ja cobrem a tabela)

---

## Detalhes Tecnicos

### SQL da Migracao

```text
-- Adicionar colunas
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS payment_date date;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS bill_status bill_status;

-- Migrar dados de bills para transactions
INSERT INTO transactions (
  user_id, description, amount, transaction_type, transaction_date,
  account_id, category_id, contact_id, notes, payment_method_id,
  context, company_id, status,
  due_date, amount_paid, payment_date, bill_status
)
SELECT
  user_id, description, amount, bill_type, due_date,
  account_id, category_id, contact_id, notes, payment_method_id,
  context, company_id,
  CASE WHEN status = 'pago' THEN 'confirmado' ELSE 'pendente' END,
  due_date, amount_paid, payment_date, status
FROM bills;
```

### Logica de Status Dinamico (front-end)

```text
function computeBillStatus(tx):
  se amount_paid >= amount -> "pago"
  se amount_paid > 0 -> "parcial"
  se due_date < hoje -> "atrasado"
  se due_date <= hoje + 7 dias -> "vence_em_breve"
  senao -> "em_dia"
```

### Arquivos Impactados

| Arquivo | Acao |
|---|---|
| Migracao SQL | Adicionar colunas + migrar dados |
| `src/components/transactions/TransactionFormDialog.tsx` | Adicionar campo due_date |
| `src/pages/Lancamentos.tsx` | Refatorar (remover bills, usar so transactions) |
| `src/components/bills/PaymentDialog.tsx` | Adaptar para atualizar transactions |
| `src/pages/FluxoCaixa.tsx` | Query de projecao usa transactions |
| `src/components/bills/BillFormDialog.tsx` | Deletar |
| `src/components/bills/BillsTab.tsx` | Deletar |
| `src/lib/validations.ts` | Remover billSchema, atualizar transactionSchema |
