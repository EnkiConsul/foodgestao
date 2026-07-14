## Objetivo

No `TransactionFormDialog`, quando o usuário marcar **Recorrente** ou **Parcelado** e escolher periodicidade **Mensal** ou **Quinzenal**, exibir um seletor de **Dia do mês (1–31)**. O `dueDate` é recalculado ao trocar o dia, e o backend valida/alinha automaticamente — igual ao padrão já existente do semanal.

## Regras de negócio

- **Mensal**: 1 ocorrência por mês no dia escolhido.
- **Quinzenal**: escolhe **1 dia** do mês; a 2ª ocorrência cai **15 dias depois** (rolando para o mês seguinte quando necessário).
- **Meses curtos** (dia 29/30/31 inexistente): usa o **último dia do mês** (clamp). Ex.: dia 31 em fevereiro → 28/29.
- Regra vale tanto na **criação** (gerando as parcelas/ocorrências) quanto na **edição** (recalcular `dueDate` da linha atual).

## Frontend — `src/components/transactions/TransactionFormDialog.tsx`

1. Novo helper `shiftToMonthDay(date, dayOfMonth)`:
   - Recebe uma data e o dia alvo (1–31).
   - Retorna nova data no mesmo mês/ano com dia = `min(dayOfMonth, últimoDiaDoMês)`.
2. Novo estado `monthDay: number` (default = dia da `date` base).
3. Renderizar um `<Select>` "Dia do vencimento" (1–31) sempre que:
   - `(isRecurring && recurrenceType ∈ {mensal, quinzenal})` **ou**
   - `(isInstallment && installmentPeriod ∈ {mensal, quinzenal})`.
   - Mesma UX/posição do seletor de dia da semana já existente.
   - Também exibir no modo edição quando a transação for parcela/filha de série mensal ou quinzenal.
4. `onChange` do seletor: `setDueDate(shiftToMonthDay(dueDate, novoDia))`.
5. `useEffect` (espelhando o do semanal): quando `date`, `isRecurring/recurrenceType`, `isInstallment/installmentPeriod` mudarem e o modo for mensal/quinzenal, realinhar `dueDate` para o `monthDay` atual (com clamp de fim de mês).
6. Geração das parcelas/ocorrências: ao calcular cada `due_date` futuro, aplicar `shiftToMonthDay` no mês correspondente. Quinzenal: base + 15 dias corridos (não força dia fixo na 2ª ocorrência).

## Backend — nova migração SQL

Estender o alinhamento hoje feito só para semanal:

1. Nova função `enforce_monthly_due_date_alignment()`:
   - Detecta se a transação é mensal/quinzenal (por `recurrence_type` própria, ou via parent quando `parent_transaction_id` presente).
   - Se `due_date` existir e o dia não bater com o dia da `transaction_date` (clampado ao último dia do mês do `due_date`), reescreve `due_date`.
   - Quinzenal: aceita `due_date` cujo dia bata com o da base **ou** 15 dias depois; caso contrário, alinha para o mais próximo.
   - `SECURITY INVOKER`, `SET search_path = public`.
2. Trigger `BEFORE INSERT OR UPDATE` em `public.transactions`.
3. Manter o trigger semanal já existente — os dois cobrem periodicidades disjuntas.

## Validação — `src/lib/validations.ts`

- Adicionar campo opcional `monthDay` (int 1–31), obrigatório apenas quando `recurrenceType`/`installmentPeriod` ∈ {mensal, quinzenal}.

## Não muda

- Fluxo anual, diário, semanal, geração de N filhos, escopo de edição, saldos, cálculo de valores das parcelas.
- Nenhuma mudança em Dashboard/FluxoCaixa/Lancamentos.
