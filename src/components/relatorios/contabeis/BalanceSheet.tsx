import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { ReportNode } from "@/hooks/useContabeisReport";
import { AccountTreeTable } from "./AccountTreeTable";
import { brlAcc, signClass } from "@/lib/format-contabil";
import { cn } from "@/lib/utils";

interface Props {
  nodes: ReportNode[];
  onSelectAnalytic?: (n: ReportNode) => void;
}

export function BalanceSheet({ nodes, onSelectAnalytic }: Props) {
  const totais = useMemo(() => {
    const ativo = nodes
      .filter((n) => n.level === 1 && n.nature === "ativo")
      .reduce((s, n) => s + Number(n.saldo_consolidado || 0), 0);
    const passivo = nodes
      .filter((n) => n.level === 1 && n.nature === "passivo")
      .reduce((s, n) => s + Number(n.saldo_consolidado || 0), 0);
    const pl = nodes
      .filter((n) => n.level === 1 && n.nature === "patrimonio_liquido")
      .reduce((s, n) => s + Number(n.saldo_consolidado || 0), 0);
    return { ativo, passivo, pl, diff: ativo - (passivo + pl) };
  }, [nodes]);

  const bate = Math.abs(totais.diff) < 0.005;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard title="Ativo" value={totais.ativo} />
        <KpiCard title="Passivo" value={totais.passivo} />
        <KpiCard title="Patrimônio Líquido" value={totais.pl} />
      </div>

      {!bate && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Balanço não fecha: Ativo {brlAcc(totais.ativo)} ≠ Passivo + PL {brlAcc(totais.passivo + totais.pl)} (diferença {brlAcc(totais.diff)}).
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Ativo</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountTreeTable nodes={nodes} filterRoots={["1"]} onSelectAnalytic={onSelectAnalytic} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Passivo + Patrimônio Líquido</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountTreeTable
              nodes={nodes}
              filterRoots={["2", "3"]}
              onSelectAnalytic={onSelectAnalytic}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className={cn("text-2xl font-bold tabular-nums", signClass(value))}>{brlAcc(value)}</p>
      </CardContent>
    </Card>
  );
}
