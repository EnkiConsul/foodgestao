import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { summarizeInvoiceDetail } from "@/lib/transactions/invoiceDetail";

export type InvoiceTransaction = {
  id: string;
  description: string;
  amount: number;
  transaction_type: "entrada" | "saida" | "transferencia";
  transaction_date: string;
  installment_number: number | null;
  installment_total: number | null;
  is_invoice_payment: boolean | null;
  category_id: string | null;
  account_id: string | null;
  credit_card_id: string | null;
  contact_id: string | null;
  notes: string | null;
  due_date: string | null;
  payment_method_id: string | null;
  categories: { name: string } | null;
  contacts: { name: string } | null;
};

interface Props {
  rows: InvoiceTransaction[] | undefined;
  loading: boolean;
  previousBalance: number;
  invoiceTotal: number;
  maskBRL: (v: number) => string;
  onSelect: (tx: InvoiceTransaction) => void;
}

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export function InvoiceTransactionsList({ rows, loading, previousBalance, invoiceTotal, maskBRL, onSelect }: Props) {
  if (loading || !rows) {
    return (
      <div className="space-y-1.5 px-3 pb-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="px-3 pb-3 text-xs text-muted-foreground">Nenhum lançamento nesta fatura.</p>;
  }

  const summary = summarizeInvoiceDetail(rows, previousBalance);

  return (
    <div className="px-3 pb-3">
      <ul className="divide-y rounded-md border bg-muted/30">
        {rows.map((tx) => {
          const isCredit = tx.transaction_type === "entrada";
          const parcela =
            tx.installment_number && tx.installment_total
              ? `${tx.installment_number}/${tx.installment_total}`
              : null;
          return (
            <li key={tx.id}>
              <button
                type="button"
                onClick={() => onSelect(tx)}
                className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-accent/50"
              >
                <span className="w-10 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {fmtDate(tx.transaction_date)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="truncate text-xs font-medium">{tx.description}</span>
                    {parcela && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] tabular-nums">
                        {parcela}
                      </Badge>
                    )}
                    {tx.is_invoice_payment && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        Pagamento
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[tx.categories?.name, tx.contacts?.name].filter(Boolean).join(" · ") || "Sem categoria"}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold tabular-nums ${isCredit ? "text-success" : ""}`}
                >
                  {isCredit ? "− " : ""}
                  {maskBRL(Number(tx.amount))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {summary.count} {summary.count === 1 ? "lançamento" : "lançamentos"} · soma {maskBRL(summary.net)}
          {summary.previousBalance > 0 && <> · rotativo anterior {maskBRL(summary.previousBalance)}</>}
        </span>
        <span className="font-medium text-foreground">Total da fatura {maskBRL(Number(invoiceTotal))}</span>
      </div>
    </div>
  );
}
