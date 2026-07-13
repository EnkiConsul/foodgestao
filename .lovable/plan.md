
## Objetivo

Remover a aba/tipo `parcelado` como categoria própria e transformar **Parcelado** em um **modificador** dentro de `receita` e `despesa`, exatamente no mesmo padrão do `Recorrente` (toggle no formulário, geração de N registros filhos amarrados por `parent_transaction_id`).

## Como fica no formulário (`TransactionFormDialog`)

Ao escolher **Receita** ou **Despesa**, o usuário verá dois seletores independentes de repetição (mutuamente exclusivos):

- **Recorrente** (já existe): repetição contínua até 12 meses.
- **Parcelado** (novo neste formato): número fixo de parcelas (2–360).

Quando "Parcelado" estiver ativo:
- Campos: `nº de parcelas`, `periodicidade` (mensal/quinzenal/semanal/anual), `modo do valor` (valor total dividido em N **ou** valor por parcela × N).
- Preview das parcelas (data de vencimento, valor) igual ao padrão que já foi montado.
- Categoria segue restrita pelo `type` (receita ou despesa) — sem necessidade de `parcel_direction`.

Aba "Parcelado" no topo do dialog é removida.

## Banco de dados

O tipo `parcelado` no enum e a coluna `parcel_direction` deixam de fazer sentido:

- **Manter** o enum `transaction_type` com `receita | despesa | transferencia` (o valor `parcelado` que foi adicionado ao enum permanece no schema — Postgres não permite remover valor de enum — mas passa a ser **não utilizado**; o form nunca gera e o backend não trata mais como caso especial).
- **Remover** referência funcional a `parcel_direction`:
  - Reverter `recompute_account_balance`, `get_balance_before`, `plin_ia_summary`, `plin_ia_cashflow` ao comportamento anterior (parcelas contam pelo próprio `type = receita/despesa`, como qualquer outra transação).
  - Ajustar a trigger `validate_installment_transaction` para não exigir `parcel_direction`, apenas validar consistência de `installment_number/total/parent_transaction_id` quando presentes.
  - A coluna `parcel_direction` pode ficar no schema (nullable, não usada) para evitar migração destrutiva; opcionalmente `DROP COLUMN` numa migração dedicada.

## Frontend

- `src/lib/transaction-sign.ts`: remover lógica que lê `parcel_direction`; parcelas herdam o `type` normal.
- `src/pages/Dashboard.tsx`, `FluxoCaixa.tsx`, `Lancamentos.tsx`: remover `effectiveTransactionType` — parcelas já são `receita/despesa`, entram nos somatórios naturalmente. O "parent âncora" continua com `status = cancelado` e é ignorado como hoje.
- Badge "n/N" nas parcelas: mantido na listagem.
- Diálogo de escopo (esta / esta e futuras / todas) via `parent_transaction_id`: mantido.
- `src/lib/validations.ts`: ajustar schema — `installment_total ≥ 2` só quando `is_installment = true`; remover `parcel_direction`.

## Geração de parcelas

Ao salvar uma receita/despesa com "Parcelado" marcado:
1. Cria 1 parent com `status = cancelado`, `installment_total = N`, sem `installment_number`.
2. Cria N filhos com `type = receita|despesa` (herdado), `parent_transaction_id`, `installment_number = 1..N`, `installment_total = N`, `due_date` calculada pela periodicidade, valor conforme modo escolhido (última parcela ajusta centavos no modo "valor total").

## Passos de implementação

1. **Migração SQL:** reverter funções (`recompute_account_balance`, `get_balance_before`, `plin_ia_summary`, `plin_ia_cashflow`) para lógica sem `parcel_direction`; ajustar trigger `validate_installment_transaction`.
2. **Form (`TransactionFormDialog.tsx`):** remover aba/tipo Parcelado; adicionar bloco `Parcelado` como toggle dentro de receita/despesa (espelhando o bloco Recorrente); mutex com Recorrente.
3. **Validations (`src/lib/validations.ts`):** remover `parcel_direction`, condicionar campos ao flag `is_installment`.
4. **transaction-sign / Dashboard / FluxoCaixa / Lancamentos:** remover `effectiveTransactionType` e uso de `parcel_direction`.
5. **Types:** regenerar após migração.

## Não muda

- Anexos, tags, categorias, contas, contatos, status, escopo de edição em massa: iguais.
- Recorrente permanece exatamente como está.
