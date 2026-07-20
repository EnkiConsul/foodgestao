## Objetivo

Remover o campo "Data" visível no formulário de cadastro de lançamento. O sistema passa a atribuir automaticamente a data (data atual no momento da criação) sem que o usuário precise ver ou digitar.

## Escopo

Apenas alteração de UI em `src/components/transactions/TransactionFormDialog.tsx`. Nenhuma mudança no banco, triggers, RLS ou hooks.

## Mudanças

1. **Remover o bloco visual do campo "Data"** (linhas 926–940 aprox., `<div data-field="transaction_date">` com Label + DatePicker).
2. **Manter o estado `date` interno** já existente, que:
   - Em novo lançamento: continua inicializado com `format(new Date(), "yyyy-MM-dd")` → vira automaticamente a data de criação.
   - Em edição: continua carregando `transaction.transaction_date` (não altera lançamentos já criados).
   - Em duplicação: mantemos o comportamento atual (herda do original) — pode ser ajustado para "hoje" se preferir; ver pergunta abaixo.
3. **Preservar toda a lógica dependente de `date`** (payload, parcelas, recorrência, preview) — apenas o input desaparece da tela.

## Fora do escopo

- Nenhuma alteração nos campos "Data de vencimento" e "Data de pagamento" — permanecem visíveis e editáveis como hoje.
- Nenhuma migração de dados.

## Validação

- Abrir "Novo lançamento" → o campo "Data" não aparece mais; ao salvar, o registro é gravado com `transaction_date = hoje`.
- Editar lançamento existente → data original é preservada.
- Parcelamento e recorrência continuam gerando datas corretamente a partir da data atual.
