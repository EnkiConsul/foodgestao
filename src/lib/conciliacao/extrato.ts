/**
 * Modelo do Extrato de Conciliação (comparativo banco x plataforma).
 *
 * Funções puras: recebem as linhas de staging da Pluggy (lado banco) e as
 * transações vinculadas (lado plataforma) e produzem os totais, o comparativo
 * linha a linha e a lista de divergências.
 */

export type ExtratoStatus = "pending" | "confirmed" | "ignored" | "duplicate";

export interface ExtratoStagingLike {
  id: string;
  date: string;
  description: string | null;
  amount: number;
  status: ExtratoStatus | string;
  matched_transaction_id?: string | null;
  pluggy_account_id?: string | null;
  connection_id?: string | null;
}

export interface ExtratoTxLike {
  id: string;
  pluggy_staging_transaction_id?: string | null;
  description: string | null;
  amount: number;
  transaction_type?: string | null;
  category_name?: string | null;
  contact_name?: string | null;
  account_name?: string | null;
  payment_method_name?: string | null;
  date?: string | null;
}

export type ExtratoSide = "credito" | "debito";

export interface ExtratoPlatformItem {
  id: string;
  description: string;
  amount: number;
  categoryName: string | null;
  contactName: string | null;
  accountName: string | null;
  paymentMethodName: string | null;
}

export interface ExtratoRow {
  stagingId: string;
  date: string;
  bankDescription: string;
  amount: number;
  side: ExtratoSide;
  status: ExtratoStatus;
  /** true quando existe pelo menos um lançamento na plataforma vinculado a esta linha */
  conciliado: boolean;
  /** lançamentos vinculados (mais de um quando a linha do banco foi dividida) */
  platforms: ExtratoPlatformItem[];
  /** soma dos valores absolutos dos lançamentos vinculados */
  platformTotal: number;
  /** true quando a soma dos lançamentos difere do valor do banco */
  divergenteValor: boolean;
}


export interface ExtratoBucket {
  total: number;
  count: number;
}

export interface ExtratoTotais {
  creditos: ExtratoBucket;
  debitos: ExtratoBucket;
  creditosSemConciliacao: ExtratoBucket;
  debitosSemConciliacao: ExtratoBucket;
  /** soma algébrica de todas as linhas do extrato */
  totalExtrato: number;
  /** soma algébrica das linhas conciliadas (valor do extrato) */
  totalConciliado: number;
  /** totalExtrato - totalConciliado */
  diferenca: number;
}

export interface ExtratoModel {
  rows: ExtratoRow[];
  totais: ExtratoTotais;
  divergencias: ExtratoRow[];
  periodo: { from: string | null; to: string | null };
}

const STATUSES: ExtratoStatus[] = ["pending", "confirmed", "ignored", "duplicate"];

function normalizeStatus(status: string): ExtratoStatus {
  return (STATUSES as string[]).includes(status) ? (status as ExtratoStatus) : "pending";
}

export function sideOf(amount: number): ExtratoSide {
  return amount >= 0 ? "credito" : "debito";
}

function emptyBucket(): ExtratoBucket {
  return { total: 0, count: 0 };
}

function addTo(bucket: ExtratoBucket, amount: number) {
  bucket.total += amount;
  bucket.count += 1;
}

export type ExtratoStatusFilter = "all" | "conciliados" | "sem-conciliacao";

/** Monta o modelo completo do extrato. */
export function buildExtratoConciliacao({
  staging,
  transactions,
  statusFilter = "all",
}: {
  staging: ExtratoStagingLike[];
  transactions: ExtratoTxLike[];
  statusFilter?: ExtratoStatusFilter;
}): ExtratoModel {
  const txByStaging = new Map<string, ExtratoTxLike>();
  const txById = new Map<string, ExtratoTxLike>();
  for (const tx of transactions) {
    txById.set(tx.id, tx);
    if (tx.pluggy_staging_transaction_id) txByStaging.set(tx.pluggy_staging_transaction_id, tx);
  }

  const all: ExtratoRow[] = staging
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)))
    .map((s) => {
      const status = normalizeStatus(s.status);
      const tx =
        txByStaging.get(s.id) ??
        (s.matched_transaction_id ? txById.get(s.matched_transaction_id) : undefined);
      const conciliado = status === "confirmed" && !!tx;
      return {
        stagingId: s.id,
        date: s.date,
        bankDescription: (s.description ?? "").trim() || "Sem descrição",
        amount: Number(s.amount ?? 0),
        side: sideOf(Number(s.amount ?? 0)),
        status,
        conciliado,
        platform: tx
          ? {
              id: tx.id,
              description: (tx.description ?? "").trim() || "Sem descrição",
              amount: Number(tx.amount ?? 0),
              categoryName: tx.category_name ?? null,
              contactName: tx.contact_name ?? null,
              accountName: tx.account_name ?? null,
              paymentMethodName: tx.payment_method_name ?? null,
            }
          : null,
      } satisfies ExtratoRow;
    });

  // Os totais do extrato sempre consideram TODAS as linhas do banco no período;
  // o filtro de status afeta apenas a lista exibida.
  const totais: ExtratoTotais = {
    creditos: emptyBucket(),
    debitos: emptyBucket(),
    creditosSemConciliacao: emptyBucket(),
    debitosSemConciliacao: emptyBucket(),
    totalExtrato: 0,
    totalConciliado: 0,
    diferenca: 0,
  };

  for (const r of all) {
    totais.totalExtrato += r.amount;
    if (r.side === "credito") addTo(totais.creditos, r.amount);
    else addTo(totais.debitos, r.amount);

    if (r.conciliado) {
      totais.totalConciliado += r.amount;
    } else if (r.side === "credito") {
      addTo(totais.creditosSemConciliacao, r.amount);
    } else {
      addTo(totais.debitosSemConciliacao, r.amount);
    }
  }
  totais.diferenca = totais.totalExtrato - totais.totalConciliado;

  const rows =
    statusFilter === "conciliados"
      ? all.filter((r) => r.conciliado)
      : statusFilter === "sem-conciliacao"
        ? all.filter((r) => !r.conciliado)
        : all;

  return {
    rows,
    totais,
    divergencias: all.filter((r) => !r.conciliado),
    periodo: {
      from: all.length ? all[0].date : null,
      to: all.length ? all[all.length - 1].date : null,
    },
  };
}

export interface ExtratoDayGroup {
  date: string;
  rows: ExtratoRow[];
  total: number;
}

/** Agrupa as linhas por dia (mantendo a ordem cronológica). */
export function groupExtratoByDay(rows: ExtratoRow[]): ExtratoDayGroup[] {
  const map = new Map<string, ExtratoRow[]>();
  for (const r of rows) {
    const list = map.get(r.date);
    if (list) list.push(r);
    else map.set(r.date, [r]);
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, list]) => ({
      date,
      rows: list,
      total: list.reduce((acc, r) => acc + r.amount, 0),
    }));
}

export const EXTRATO_STATUS_LABEL: Record<ExtratoStatus, string> = {
  pending: "Sem conciliação",
  confirmed: "Conciliado",
  ignored: "Ignorado",
  duplicate: "Duplicado",
};
