import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import type { ReportNode, Regime } from "@/hooks/useContabeisReport";
import { AccountTreeTable } from "./AccountTreeTable";
import { brlAcc, pct, signClass } from "@/lib/format-contabil";
import { cn } from "@/lib/utils";

interface Props {
  nodes: ReportNode[];
  onSelectAnalytic?: (n: ReportNode) => void;
  from?: string;
  to?: string;
  regime?: Regime;
  contextLabel?: string;
}

function totalByNature(nodes: ReportNode[], nature: string): number {
  // Somente contas raiz (level=1) evitam dupla contagem: elas já contêm saldo_consolidado dos filhos.
  return nodes
    .filter((n) => n.level === 1 && n.nature === nature)
    .reduce((s, n) => s + Number(n.saldo_consolidado || 0), 0);
}

export function DreReport({ nodes, onSelectAnalytic }: Props) {
  const totais = useMemo(() => {
    const receita = totalByNature(nodes, "receita");
    const impostos = totalByNature(nodes, "imposto");
    const custos = totalByNature(nodes, "custo");
    const despOp = totalByNature(nodes, "despesa_operacional");
    const despFin = totalByNature(nodes, "despesa_financeira");

    const receita_liquida = receita - impostos;
    const lucro_bruto = receita_liquida - custos;
    const ebitda = lucro_bruto - despOp;
    const resultado = ebitda - despFin;
    const mBruta = receita_liquida ? (lucro_bruto / receita_liquida) * 100 : 0;
    const mLiquida = receita_liquida ? (resultado / receita_liquida) * 100 : 0;

    return {
      receita,
      impostos,
      receita_liquida,
      custos,
      lucro_bruto,
      despOp,
      ebitda,
      despFin,
      resultado,
      mBruta,
      mLiquida,
    };
  }, [nodes]);

  // Filtra roots que entram na DRE (in_dre = true) → 4,5,6,7,8
  const dreRoots = ["4", "5", "6", "7", "8"];

  return (
    <div className="space-y-6">
      {/* Cards de KPIs */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard title="Receita Líquida" value={totais.receita_liquida} />
        <KpiCard title="Lucro Bruto" value={totais.lucro_bruto} subtitle={`Margem ${pct(totais.mBruta)}`} />
        <KpiCard title="EBITDA" value={totais.ebitda} />
        <KpiCard title="Resultado Líquido" value={totais.resultado} subtitle={`Margem ${pct(totais.mLiquida)}`} />
      </div>

      {/* Estrutura sintética da DRE (linhas calculadas) */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Demonstração de Resultado (DRE)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <SummaryRow label="Receita Bruta" value={totais.receita} />
          <SummaryRow label="(−) Impostos sobre Vendas" value={-totais.impostos} muted />
          <SummaryRow label="= Receita Líquida" value={totais.receita_liquida} bold />
          <SummaryRow label="(−) Custos" value={-totais.custos} muted />
          <SummaryRow label="= Lucro Bruto" value={totais.lucro_bruto} bold hint={`Margem ${pct(totais.mBruta)}`} />
          <SummaryRow label="(−) Despesas Operacionais" value={-totais.despOp} muted />
          <SummaryRow label="= EBITDA / Operacional" value={totais.ebitda} bold />
          <SummaryRow label="(−) Despesas Financeiras" value={-totais.despFin} muted />
          <SummaryRow
            label="= Resultado Líquido"
            value={totais.resultado}
            bold
            highlight
            hint={`Margem ${pct(totais.mLiquida)}`}
          />
        </CardContent>
      </Card>

      {/* Árvore analítica */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">Detalhamento por Conta Contábil</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountTreeTable
            nodes={nodes}
            filterRoots={dreRoots}
            avBase={totais.receita_liquida}
            onSelectAnalytic={onSelectAnalytic}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
        <p className={cn("text-2xl font-bold tabular-nums", signClass(value))}>{brlAcc(value)}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  bold,
  muted,
  highlight,
  hint,
}: {
  label: string;
  value: number;
  bold?: boolean;
  muted?: boolean;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md border-b border-border/40",
        highlight && "bg-primary/5",
        bold && "font-semibold"
      )}
    >
      <span className={cn("flex-1", muted && "text-muted-foreground")}>{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <span className={cn("w-40 text-right tabular-nums", signClass(value))}>{brlAcc(value)}</span>
    </div>
  );
}
