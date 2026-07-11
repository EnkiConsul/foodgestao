# Permitir sinais livres em Lançamentos + cores pelo sinal

## Objetivo
Aceitar qualquer sinal em `amount` (exceto zero) em qualquer `transaction_type`. Efeito algébrico no saldo/DRE/relatórios: `contribuição = sign_by_type * amount` (receita = +1, despesa = -1). As **cores** exibidas passam a seguir o **sinal do efeito no saldo**, não o tipo:

| Tipo | Valor | Efeito no saldo | Cor |
|---|---|---|---|
| Receita | +100 | +100 (crédito) | verde |
| Receita | -500 | -500 (débito, estorno) | vermelho |
| Despesa | +100 | -100 (débito) | vermelho |
| Despesa | -80 | +80 (crédito, reembolso) | verde |

Regra: **verde quando o efeito é positivo (entra dinheiro), vermelho quando negativo (sai dinheiro)**.

## Situação atual
- Balanços/DRE (`update_account_balance`, `get_dre_periodo`, `get_account_balances`) já usam `receita→+amount, despesa→-amount`, ou seja, sinais negativos propagam corretamente sem alterar triggers.
- Bloqueios:
  - `transactionSchema`: `amount.positive()`
  - `CurrencyInput`: `.replace(/\D/g, "")` descarta o `-`
  - `parseAmount` em `nubankPdf.ts`: `Math.abs`
- Cores hoje: componentes decidem pela `transaction_type` (verde=receita, vermelho=despesa).

## Mudanças

### 1. `src/lib/validations.ts`
```ts
amount: z.number().finite().refine((v) => v !== 0, "Valor não pode ser zero")
```

### 2. `src/components/ui/currency-input.tsx`
- Aceitar `-` opcional no início: `raw` preserva o sinal.
- `formatCurrency` detecta sinal, formata módulo e prefixa `-`.
- `parseCurrencyToNumber` já respeita `-` via `parseFloat`.

### 3. `src/lib/statement-import/nubankPdf.ts`
Remover `Math.abs` em `parseAmount` — sinal do extrato preservado no import.

### 4. Cores pelo sinal — novo helper compartilhado
Criar `src/lib/transaction-sign.ts`:
```ts
export function transactionSignedAmount(t: { transaction_type: string; amount: number }): number {
  if (t.transaction_type === "receita") return t.amount;
  if (t.transaction_type === "despesa") return -t.amount;
  return t.amount; // transferencia mantém neutro
}
export function transactionColorClass(t: { transaction_type: string; amount: number }): string {
  const signed = transactionSignedAmount(t);
  if (signed > 0) return "text-emerald-600 dark:text-emerald-400";
  if (signed < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}
```

Substituir a lógica atual `type === "receita" ? verde : vermelho` nos pontos onde a cor do **valor** é aplicada:
- `src/pages/Lancamentos.tsx` (linhas/valor da linha e resumo)
- `src/components/lancamentos/*` (badges/valor)
- `src/pages/Dashboard.tsx` (cards recentes)
- `src/pages/FluxoCaixa.tsx` (colunas de entrada/saída — se o valor tem sinal invertido, ele muda de coluna)
- `src/pages/Relatorios.tsx` (linhas de valor)

**Escopo do helper**: aplicar apenas no **valor monetário exibido** e em **ícones/setas de direção**. Não mudar cores de badges "Receita/Despesa" (que continuam identificando o **tipo** declarado) — só o valor e a seta seguem o sinal do efeito.

Para Fluxo de Caixa e agrupamentos "Entradas/Saídas", classificar por `transactionSignedAmount > 0` em vez de `type === "receita"`, para que um estorno de receita apareça na coluna de saída.

### 5. Formatação de números
`formatBRL` / `Intl.NumberFormat("pt-BR", currency)` já formatam negativos como `-R$ 100,00`. Sem alteração.

### 6. Recorrências, exportações CSV, orçamento
Sem alteração — todos operam com soma algébrica.

### 7. Backend
Sem migração. `transactions.amount` é `numeric` livre.

## O que NÃO faremos
- Sem CHECK no banco.
- Não alterar `transaction_type` (receita/despesa continuam sendo a intenção; sinal é livre).
- Badges de **tipo** continuam pelo tipo (verde=Receita, vermelho=Despesa como rótulos). Só a cor do **valor** e a **coluna de fluxo** seguem o sinal.
