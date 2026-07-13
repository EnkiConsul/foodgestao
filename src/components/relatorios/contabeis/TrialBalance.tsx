import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import type { ReportNode } from "@/hooks/useContabeisReport";
import { AccountTreeTable } from "./AccountTreeTable";
import { brl, brlAcc } from "@/lib/format-contabil";
import { cn } from "@/lib/utils";

interface Props {
  nodes: ReportNode[];
  onSelectAnalytic?: (n: ReportNode) => void;
}

export function TrialBalance({ nodes, onSelectAnalytic }: Props) {
  const totais = useMemo(() => {
    // Somatório de débitos/créditos das folhas analíticas.
    const analytic = nodes.filter((n) => n.is_analytic);
    const deb = analytic.reduce((s, n) => s + Number(n.debitos || 0), 0);
    const cred = analytic.reduce((s, n) => s + Number(n.creditos || 0), 0);
    return { deb, cred, diff: cred - deb };
  }, [nodes]);

  const bate = Math.abs(totais.diff) < 0.005;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Σ Débitos</p>
            <p className="text-xl font-bold tabular-nums">{brl(totais.deb)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase">Σ Créditos</p>
            <p className="text-xl font-bold tabular-nums">{brl(totais.cred)}</p>
          </CardContent>
        </Card>
        <Card className={cn(!bate && "border-destructive")}>
          <CardContent className="p-4 flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground uppercase">Diferença</p>
              <p className={cn("text-xl font-bold tabular-nums", !bate && "text-destructive")}>
                {brlAcc(totais.diff)}
              </p>
            </div>
            {!bate && <AlertTriangle className="h-6 w-6 text-destructive" />}
          </CardContent>
        </Card>
      </div>

      {!bate && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Balancete não fecha: revise lançamentos ou classificação de contas.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Balancete por Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountTreeTable nodes={nodes} onSelectAnalytic={onSelectAnalytic} />
        </CardContent>
      </Card>
    </div>
  );
}
