# Fase 9 — Projeção de Caixa com Faturas de Cartão

## Objetivo
Adicionar uma projeção de caixa configurável (7/15/30/60/90 dias) que combine:
- Saldo atual das contas bancárias
- Lançamentos pendentes (entradas e saídas) com `due_date` no intervalo
- Faturas de cartão em aberto/parciais/vencidas com `due_date` no intervalo

Visualização em gráfico de linha (saldo projetado dia a dia) + KPIs de resumo.

## Entregáveis

### 1. Hook `useCashFlowProjection`
Arquivo novo: `src/hooks/useCashFlowProjection.tsx`

Entradas:
- `horizonDays: 7 | 15 | 30 | 60 | 90`
- `context` e `companyId` do contexto global

Saída:
- `startingBalance`: soma dos saldos atuais das contas (exclui contas de cartão)
- `series: { date, inflow, outflow, cardOutflow, netFlow, projectedBalance }[]` — um ponto por dia
- `totals`: `{ totalInflow, totalOutflow, totalCardOutflow, endingBalance, lowestBalance, lowestDate }`
- `isLoading`

Fontes (Realtime nas 3):
- `bank_connection_accounts` para saldo inicial
- `transactions` com `status IN ('pendente','parcial')` e `due_date` entre hoje e hoje+N, **excluindo** as que já pertencem a `invoice_id` (para evitar dupla contagem — a fatura já agrega)
- `credit_card_invoices` com `status IN ('aberta','fechada','parcial','vencida')` e `due_date` entre hoje e hoje+N, valor = `total_amount - amount_paid`

### 2. Componente `CashFlowProjectionWidget`
Arquivo novo: `src/components/dashboard/CashFlowProjectionWidget.tsx`

- Header com título + `Select` de intervalo (7/15/30/60/90 dias), persistido em `localStorage`
- 4 KPIs: Saldo Atual, Entradas Previstas, Saídas Previstas (destacando fatia de cartão), Saldo Final Projetado
- Alerta visual quando `lowestBalance < 0` indicando data do estouro
- Gráfico de área com `recharts` (`AreaChart`) mostrando `projectedBalance` com gradiente; tooltip com breakdown diário (entradas/saídas/cartão)
- Respeita `maskBRL` (modo privacidade)
- Empty state quando não há movimentações no horizonte

### 3. Integração na Dashboard
Editar `src/pages/Dashboard.tsx`:
- Inserir o widget em uma nova linha `col-span-12` logo abaixo da linha atual (Faturas + Evolução do Saldo), antes de "Top 5 Categorias"

## Detalhes técnicos
- Cálculo do `projectedBalance[i] = projectedBalance[i-1] + inflow[i] - outflow[i] - cardOutflow[i]`, iniciando de `startingBalance`
- Datas normalizadas em `America/Sao_Paulo` usando helpers existentes de `src/lib/date.ts`
- Reuso de `maskBRL` de `src/lib/privacy.ts` e cores semânticas do design system (nada hardcoded)
- Sem alteração de schema — puramente leitura

## Fora de escopo
- Recorrências futuras ainda não materializadas (já são geradas até 12 meses à frente pela fase de recorrentes, então aparecem naturalmente)
- Cenários "what-if" (adiar pagamento X) — pode virar Fase 10
