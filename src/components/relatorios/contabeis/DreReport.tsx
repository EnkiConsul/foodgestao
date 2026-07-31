import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import type { ReportNode, Regime } from "@/hooks/useContabeisReport";
import { AccountTreeTable } from "./AccountTreeTable";
import { brlAcc, pct, signClass, dreSign } from "@/lib/format-contabil";
import { cn } from "@/lib/utils";

interface Props {
  nodes: ReportNode[];
  onSelectAnalytic?: (n: ReportNode) => void;
  from?: string;
  to?: string;
  regime?: Regime;
  contextLabel?: string;
}

const NATURE_ROOT: Record<string, string> = {
  receita: "4",
  custo: "5",
  despesa_operacional: "6",
  despesa_financeira: "7",
  imposto: "8",
};

/**
 * Total de uma natureza em magnitude positiva.
 * O relatório devolve saldo com sinal (entrada +, saída -), então despesas,
 * custos e impostos chegam negativos: aplicamos dre_sign para normalizar.
 * Somente contas raiz (level=1) para evitar dupla contagem.
 */
function totalByNature(nodes: ReportNode[], nature: string): number {
  const rootCode = NATURE_ROOT[nature];
  return nodes
    .filter((n) => n.level === 1 && (n.nature === nature || (!n.nature && n.root_code === rootCode)))
    .reduce((s, n) => s + Number(n.saldo_consolidado || 0) * dreSign(n), 0);
}

export function DreReport({ nodes, onSelectAnalytic, from, to, regime, contextLabel }: Props) {
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

  const handleExportPdf = () => {
    const periodLabel =
      from && to
        ? `${format(new Date(from + "T00:00:00"), "dd/MM/yyyy")} a ${format(new Date(to + "T00:00:00"), "dd/MM/yyyy")}`
        : "";
    const regimeLabel = regime === "caixa" ? "Caixa" : "Competência";
    const now = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
    const fmt = (v: number) => brlAcc(v);

    // Linhas analíticas (contas com movimento) ordenadas por código
    const analytics = nodes
      .filter((n) => dreRoots.includes(n.root_code) && n.is_analytic && (n.has_movement || Number(n.saldo_proprio) !== 0))
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

    const analyticRows = analytics
      .map(
        (n) => `
        <tr>
          <td>${n.code}</td>
          <td>${n.name}</td>
          <td class="num">${fmt(Number(n.saldo_proprio || 0))}</td>
        </tr>`
      )
      .join("");

    const pdfWindow = window.open("", "_blank");
    if (!pdfWindow) return;
    pdfWindow.document.write(`
      <!DOCTYPE html><html><head><title>DRE Gerencial ${periodLabel}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; padding: 16px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 13px; margin: 18px 0 6px; }
        .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th, td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        th { background: #f5f5f5; text-align: left; font-size: 11px; }
        .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .bold { font-weight: 700; }
        .muted { color: #555; }
        .highlight { background: #fff7ed; }
        .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
        .kpi { border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 6px; }
        .kpi .t { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .05em; }
        .kpi .v { font-size: 16px; font-weight: 700; }
        .kpi .s { font-size: 10px; color: #666; }
        @page { size: A4; margin: 12mm; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>DRE Gerencial</h1>
      <div class="meta">
        ${contextLabel ? `<div><strong>${contextLabel}</strong></div>` : ""}
        <div>Período: ${periodLabel} · Regime: ${regimeLabel}</div>
        <div>Gerado em ${now}</div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="t">Receita Líquida</div><div class="v">${fmt(totais.receita_liquida)}</div></div>
        <div class="kpi"><div class="t">Lucro Bruto</div><div class="v">${fmt(totais.lucro_bruto)}</div><div class="s">Margem ${pct(totais.mBruta)}</div></div>
        <div class="kpi"><div class="t">EBITDA</div><div class="v">${fmt(totais.ebitda)}</div></div>
        <div class="kpi"><div class="t">Resultado Líquido</div><div class="v">${fmt(totais.resultado)}</div><div class="s">Margem ${pct(totais.mLiquida)}</div></div>
      </div>

      <h2>Demonstração de Resultado</h2>
      <table>
        <tbody>
          <tr><td>Receita Bruta</td><td class="num">${fmt(totais.receita)}</td></tr>
          <tr class="muted"><td>(−) Impostos sobre Vendas</td><td class="num">${fmt(-totais.impostos)}</td></tr>
          <tr class="bold"><td>= Receita Líquida</td><td class="num">${fmt(totais.receita_liquida)}</td></tr>
          <tr class="muted"><td>(−) Custos</td><td class="num">${fmt(-totais.custos)}</td></tr>
          <tr class="bold"><td>= Lucro Bruto (Margem ${pct(totais.mBruta)})</td><td class="num">${fmt(totais.lucro_bruto)}</td></tr>
          <tr class="muted"><td>(−) Despesas Operacionais</td><td class="num">${fmt(-totais.despOp)}</td></tr>
          <tr class="bold"><td>= EBITDA / Operacional</td><td class="num">${fmt(totais.ebitda)}</td></tr>
          <tr class="muted"><td>(−) Despesas Financeiras</td><td class="num">${fmt(-totais.despFin)}</td></tr>
          <tr class="bold highlight"><td>= Resultado Líquido (Margem ${pct(totais.mLiquida)})</td><td class="num">${fmt(totais.resultado)}</td></tr>
        </tbody>
      </table>

      <h2>Detalhamento por Conta Contábil</h2>
      <table>
        <thead><tr><th style="width:90px;">Código</th><th>Conta</th><th class="num" style="width:140px;">Saldo</th></tr></thead>
        <tbody>${analyticRows || `<tr><td colspan="3" class="muted">Sem movimento no período.</td></tr>`}</tbody>
      </table>
      </body></html>
    `);
    pdfWindow.document.close();
    setTimeout(() => pdfWindow.print(), 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-1" onClick={handleExportPdf}>
          <Download className="h-3.5 w-3.5" /> Exportar PDF
        </Button>
      </div>

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
