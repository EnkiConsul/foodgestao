import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import {
  useContabeisLedger,
  type Regime,
  type ReportNode,
  type StatusFiltro,
} from "@/hooks/useContabeisReport";
import { brlAcc, signClass } from "@/lib/format-contabil";
import { cn } from "@/lib/utils";

interface Props {
  account: ReportNode | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  from: string;
  to: string;
  regime: Regime;
  status?: StatusFiltro;
}

const STATUS_LABEL: Record<StatusFiltro, string> = {
  pago: "Pagos",
  pendente: "A Pagar/Receber",
  todos: "Todos",
};

export function GeneralLedgerDrawer({
  account,
  open,
  onOpenChange,
  from,
  to,
  regime,
  status = "pago",
}: Props) {
  const { data = [], isLoading } = useContabeisLedger(account?.id ?? null, {
    from,
    to,
    regime,
    status,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 flex-wrap">
            <span>Razão:</span>
            {account && (
              <>
                <span className="font-mono text-sm text-muted-foreground">{account.code}</span>
                <span>{account.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  {regime === "caixa" ? "Caixa" : "Competência"}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {STATUS_LABEL[status]}
                </Badge>
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2 text-sm">
          {isLoading && <p className="text-muted-foreground">Carregando…</p>}
          {!isLoading && data.length === 0 && (
            <p className="text-muted-foreground py-6 text-center">
              Sem lançamentos nesta conta no período.
            </p>
          )}
          {data.length > 0 && (
            <div className="rounded-md border">
              <div className="grid grid-cols-[90px_1fr_120px_120px] gap-2 px-2 py-2 bg-muted/60 text-xs font-medium text-muted-foreground border-b">
                <span>Data</span>
                <span>Descrição</span>
                <span className="text-right">Valor</span>
                <span className="text-right">Saldo</span>
              </div>
              {data.map((row) => {
                const valor = Number(row.valor) * (row.sinal ?? 1);
                return (
                  <div
                    key={row.transaction_id}
                    className="grid grid-cols-[90px_1fr_120px_120px] gap-2 px-2 py-2 border-b border-border/40 text-sm"
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {format(new Date(row.data), "dd/MM/yyyy")}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate">{row.descricao}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[row.categoria, row.contato, row.origem].filter(Boolean).join(" • ")}
                      </p>
                    </div>
                    <span className={cn("text-right tabular-nums", signClass(valor))}>
                      {brlAcc(valor)}
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {brlAcc(Number(row.saldo_acumulado))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
