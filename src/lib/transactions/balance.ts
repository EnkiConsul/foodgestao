/**
 * Regras puras de agregação/saldo para `transactions`.
 *
 * Estas funções reproduzem, de forma testável, a lógica financeira que hoje
 * vive em `src/pages/Lancamentos.tsx` e `src/pages/FluxoCaixa.tsx`. Elas são
 * a fonte da verdade para os testes de regressão financeira.
 *
 * Invariantes:
 * - `amount` é sempre positivo; o sinal vem de `transaction_type`.
 * - Um lançamento com `due_date` é considerado "pago" quando
 *   `amount_paid >= amount` (tolerância de 0,5 centavo para float).
 * - Sem `due_date`, o pagamento vem do `status === "confirmado"`.
 * - Somente lançamentos pagos entram no saldo realizado.
 */

export type TransactionType = "entrada" | "saida" | "transferencia";
export type TransactionStatus = "pendente" | "confirmado" | "cancelado";
export type DisplayStatus = "pago" | "a_vencer" | "atrasado";
export type BalanceRegime = "caixa" | "competencia";

export interface TxLike {
  amount: number;
  amount_paid: number;
  transaction_type: TransactionType;
  transaction_date: string; // yyyy-MM-dd
  due_date: string | null;
  /** Compra atribuída a uma fatura de cartão (competência, não afeta caixa). */
  credit_card_invoice_id?: string | null;
  /** Lançamento que representa o pagamento da fatura (esse SIM sai do caixa). */
  is_invoice_payment?: boolean;
  payment_date?: string | null;
  status: TransactionStatus;
}

const CENT_EPSILON = 0.005;

/** Lançamento cujo pagamento foi totalmente quitado. */
export function isFullyPaid(tx: Pick<TxLike, "amount" | "amount_paid">): boolean {
  return tx.amount_paid + CENT_EPSILON >= tx.amount;
}

/** Data no formato yyyy-MM-dd interpretada como fim do dia local. */
export function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Status de exibição de um lançamento (pago / a vencer / atrasado).
 * Reproduz `computeDisplayStatus` de `Lancamentos.tsx`.
 */
export function computeDisplayStatus(tx: TxLike, today: Date): DisplayStatus {
  if (tx.due_date) {
    if (isFullyPaid(tx)) return "pago";
    const due = parseYmd(tx.due_date);
    if (due && due.getTime() < today.getTime()) return "atrasado";
    return "a_vencer";
  }
  if (tx.status === "confirmado") return "pago";
  const txDate = parseYmd(tx.transaction_date);
  if (txDate && txDate.getTime() < today.getTime()) return "atrasado";
  return "a_vencer";
}

/**
 * Um lançamento entra no saldo realizado quando:
 *  - status = confirmado, OU
 *  - tem due_date e está totalmente pago.
 * Transferências continuam nulas no efeito de saldo agregado.
 */
export function isRealized(tx: TxLike): boolean {
  if (tx.status === "confirmado") return true;
  if (tx.due_date && isFullyPaid(tx)) return true;
  return false;
}

/**
 * Regime CAIXA: dinheiro que realmente entra/sai da conta bancária.
 * - Compras no cartão (credit_card_invoice_id preenchido e não é pagamento
 *   de fatura) NÃO afetam o caixa — elas só entram quando o pagamento da
 *   fatura acontece.
 * Regime COMPETÊNCIA: reconhece a despesa/receita no momento do fato gerador.
 * - O lançamento de pagamento da fatura (is_invoice_payment=true) é
 *   ignorado para não contar em dobro.
 */
export function belongsToRegime(tx: TxLike, regime: BalanceRegime): boolean {
  const isCardPurchase = Boolean(tx.credit_card_invoice_id) && !tx.is_invoice_payment;
  if (regime === "caixa") return !isCardPurchase;
  // competência
  return !tx.is_invoice_payment;
}

/** Efeito algébrico no saldo (positivo = entra dinheiro). */
export function signedEffect(tx: TxLike): number {
  if (tx.transaction_type === "entrada") return tx.amount;
  if (tx.transaction_type === "saida") return -tx.amount;
  return 0;
}

export interface RunningBalanceRow<T> {
  tx: T;
  runningBalance: number;
}

/**
 * Aplica saldo corrido em ordem cronológica. Só realiza pagamentos efetivos.
 * `regime` (default "caixa") controla se compras de cartão contam antes do
 * pagamento da fatura (competência) ou apenas quando a fatura é paga (caixa).
 */
export function runningBalance<T extends TxLike>(
  txs: T[],
  previousBalance: number,
  regime: BalanceRegime = "caixa",
): RunningBalanceRow<T>[] {
  let running = previousBalance;
  return txs.map((tx) => {
    if (isRealized(tx) && belongsToRegime(tx, regime)) {
      running += signedEffect(tx);
    }
    return { tx, runningBalance: running };
  });
}

export interface PeriodTotals {
  /** Total realizado (entradas concretas). */
  receitas: number;
  /** Total realizado (saídas concretas). */
  despesas: number;
  /** Restante a pagar em despesas pendentes (amount - amount_paid). */
  aPagar: number;
  /** Restante a receber em receitas pendentes. */
  aReceber: number;
  /** Quantidade de lançamentos com display "atrasado". */
  atrasadas: number;
  /** Soma bruta de todas as receitas do período (independente de pagamento). */
  allReceitas: number;
  /** Soma bruta de todas as despesas. */
  allDespesas: number;
  /** allReceitas - allDespesas. */
  saldoPeriodo: number;
  /** previousBalance + saldoPeriodo. */
  saldoAcumulado: number;
}

/**
 * Agrega totais do período reproduzindo o cálculo de `Lancamentos.tsx`.
 * `regime` filtra os lançamentos considerados (default "caixa").
 */
export function computePeriodTotals(
  txs: TxLike[],
  today: Date,
  previousBalance = 0,
  regime: BalanceRegime = "caixa",
): PeriodTotals {
  const scoped = txs.filter((t) => belongsToRegime(t, regime));
  const realized = scoped.filter(isRealized);
  const receitas = realized
    .filter((t) => t.transaction_type === "entrada")
    .reduce((s, t) => s + t.amount, 0);
  const despesas = realized
    .filter((t) => t.transaction_type === "saida")
    .reduce((s, t) => s + t.amount, 0);

  const withStatus = scoped.map((t) => ({ tx: t, status: computeDisplayStatus(t, today) }));
  const pending = withStatus.filter((r) => r.status !== "pago");
  const aPagar = pending
    .filter((r) => r.tx.transaction_type === "saida")
    .reduce((s, r) => s + Math.max(0, r.tx.amount - r.tx.amount_paid), 0);
  const aReceber = pending
    .filter((r) => r.tx.transaction_type === "entrada")
    .reduce((s, r) => s + Math.max(0, r.tx.amount - r.tx.amount_paid), 0);
  const atrasadas = withStatus.filter((r) => r.status === "atrasado").length;

  const allReceitas = scoped
    .filter((t) => t.transaction_type === "entrada")
    .reduce((s, t) => s + t.amount, 0);
  const allDespesas = scoped
    .filter((t) => t.transaction_type === "saida")
    .reduce((s, t) => s + t.amount, 0);
  const saldoPeriodo = allReceitas - allDespesas;

  return {
    receitas,
    despesas,
    aPagar,
    aReceber,
    atrasadas,
    allReceitas,
    allDespesas,
    saldoPeriodo,
    saldoAcumulado: previousBalance + saldoPeriodo,
  };
}

/**
 * Ajustes que devem ser aplicados quando o usuário alterna o status do
 * lançamento na UI (equivalente ao bloco de `handleStatusChange` em
 * `Lancamentos.tsx`). Retorna apenas os campos que mudam.
 */
export interface StatusChangeInput {
  amount: number;
  amount_paid: number;
  payment_date: string | null;
  status: TransactionStatus;
}

export interface StatusChangePatch {
  status?: TransactionStatus;
  amount_paid?: number;
  payment_date?: string | null;
}

export function statusChangePatch(
  current: StatusChangeInput,
  next: TransactionStatus,
  today: string,
): StatusChangePatch {
  const patch: StatusChangePatch = { status: next };
  if (next === "confirmado") {
    if (!current.payment_date) patch.payment_date = today;
    if (current.amount_paid === 0) patch.amount_paid = current.amount;
  } else if (next === "pendente") {
    patch.amount_paid = 0;
    patch.payment_date = null;
  } else if (next === "cancelado") {
    patch.amount_paid = 0;
    patch.payment_date = null;
  }
  return patch;
}

/**
 * Comparação entre o saldo do razão (calculado pelos lançamentos confirmados,
 * fonte da verdade) e o saldo informado pelo banco via Open Finance (apenas
 * referência). Divergência acima de meio centavo indica lançamento faltando,
 * duplicado ou ainda a conciliar.
 */
export interface BankLedgerComparison {
  ledger: number;
  bank: number | null;
  /** bank - ledger (null quando não há saldo do banco) */
  diff: number | null;
  divergent: boolean;
}

export function compareBankLedger(
  ledger: number | null | undefined,
  bank: number | null | undefined,
  tolerance = CENT_EPSILON,
): BankLedgerComparison {
  const led = Number(ledger ?? 0);
  if (bank === null || bank === undefined || Number.isNaN(Number(bank))) {
    return { ledger: led, bank: null, diff: null, divergent: false };
  }
  const bnk = Number(bank);
  const diff = Number((bnk - led).toFixed(2));
  return { ledger: led, bank: bnk, diff, divergent: Math.abs(diff) > tolerance };
}
