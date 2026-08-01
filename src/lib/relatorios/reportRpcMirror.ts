/**
 * Espelho puro da RPC `chart_accounts_report`.
 *
 * Usado pelos testes de integração para recalcular, no cliente, os mesmos
 * totais que o banco devolve — garantindo que trocar os filtros no front-end
 * (período, regime, incluir contas sem movimento) produza números idênticos.
 *
 * Regras replicadas da RPC:
 * - Competência: data efetiva = due_date ?? transaction_date, valor = amount.
 * - Caixa: exige payment_date e amount_paid <> 0; valor = amount_paid.
 * - Ignora status 'cancelado' e tipos diferentes de entrada/saida.
 * - Saldo consolidado agrega a própria conta + descendentes (code LIKE 'x.%').
 * - Sem `include_zero`, contas sem movimento (próprio ou de filhos) saem fora.
 */
import type { Regime } from "./reportFilters";

export interface MirrorAccount {
  id: string;
  code: string;
  name: string;
}

export interface MirrorTransaction {
  account_id: string | null;
  transaction_type: string;
  status: string;
  amount: number | null;
  amount_paid: number | null;
  due_date: string | null;
  transaction_date: string | null;
  payment_date: string | null;
  cost_center_id?: string | null;
}

export interface MirrorFilters {
  from: string;
  to: string;
  regime: Regime;
  include_zero?: boolean;
  cost_center_ids?: string[] | null;
}

export interface MirrorRow {
  code: string;
  name: string;
  debitos: number;
  creditos: number;
  saldo_proprio: number;
  saldo_consolidado: number;
  has_movement: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Data e valor efetivos de um lançamento conforme o regime, ou null se fora. */
export function mirrorEntry(
  tx: MirrorTransaction,
  regime: Regime
): { date: string; value: number } | null {
  if (tx.status === "cancelado") return null;
  if (tx.transaction_type !== "entrada" && tx.transaction_type !== "saida") return null;

  if (regime === "caixa") {
    const paid = Number(tx.amount_paid) || 0;
    if (!tx.payment_date || paid === 0) return null;
    return { date: tx.payment_date, value: paid };
  }

  const date = tx.due_date ?? tx.transaction_date;
  if (!date) return null;
  return { date, value: Number(tx.amount) || 0 };
}

export function mirrorReport(
  accounts: MirrorAccount[],
  transactions: MirrorTransaction[],
  filters: MirrorFilters
): MirrorRow[] {
  const own = new Map<string, { creditos: number; debitos: number }>();

  for (const tx of transactions) {
    if (!tx.account_id) continue;
    if (
      filters.cost_center_ids &&
      filters.cost_center_ids.length > 0 &&
      !filters.cost_center_ids.includes(tx.cost_center_id ?? "")
    ) {
      continue;
    }
    const entry = mirrorEntry(tx, filters.regime);
    if (!entry) continue;
    if (entry.date < filters.from || entry.date > filters.to) continue;

    const acc = own.get(tx.account_id) ?? { creditos: 0, debitos: 0 };
    if (tx.transaction_type === "entrada") acc.creditos += entry.value;
    else acc.debitos += entry.value;
    own.set(tx.account_id, acc);
  }

  const rows = accounts.map((a) => {
    const t = own.get(a.id) ?? { creditos: 0, debitos: 0 };
    const creditos = round(t.creditos);
    const debitos = round(t.debitos);

    let consolidado = 0;
    let hasMovement = false;
    for (const d of accounts) {
      if (d.code !== a.code && !d.code.startsWith(a.code + ".")) continue;
      const dt = own.get(d.id);
      if (!dt) continue;
      consolidado += dt.creditos - dt.debitos;
      hasMovement = true;
    }

    return {
      code: a.code,
      name: a.name,
      creditos,
      debitos,
      saldo_proprio: round(creditos - debitos),
      saldo_consolidado: round(consolidado),
      has_movement: hasMovement,
    };
  });

  return rows
    .filter((r) => (filters.include_zero ? true : r.has_movement))
    .sort((a, b) => a.code.localeCompare(b.code));
}
