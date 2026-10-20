import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import type { ReportNode, Regime } from "@/hooks/useContabeisReport";
import { AccountTreeTable } from "./AccountTreeTable";
import { brlAcc, pct, signClass, dreSign } from "@/lib/format-contabil";
import { computeDreTotais } from "@/lib/relatorios/dre";
import { computeDreGerencial } from "@/lib/relatorios/dreGerencial";
import { cn } from "@/lib/utils";
import { escapeHtml, imprimirHtmlEmQuadro } from "@/lib/print/imprimirHtml";

interface Props {
  nodes: ReportNode[];
  onSelectAnalytic?: (n: ReportNode) => void;
  from?: string;
  to?: string;
  regime?: Regime;
  contextLabel?: string;
}

export function DreReport({ nodes, onSelectAnalytic, from, to, regime, contextLabel }: Props) {
  const totais = useMemo(() => computeDreTotais(nodes), [nodes]);
  const g = useMemo(() => computeDreGerencial(nodes), [nodes]);
  const linhas: { label: string; value: number; kind?: "sub" | "total" | "final" }[] = [
    { label: "Receita Bruta", value: g.receitaBruta, kind: "total" },
    { label: "(−) Deduções da Receita (descontos, cancelamentos e tributos sobre faturamento)", value: -g.deducoes, kind: "sub" },
    { label: "= Receita Líquida", value: g.receitaLiquida, kind: "total" },
    { label: "(−) CMV", value: -g.cmv, kind: "sub" },
    { label: "= Lucro Bruto", value: g.lucroBruto, kind: "total" },
    { label: "(−) Mão de Obra Direta", value: -g.maoObraDireta, kind: "sub" },
    { label: "= Margem após Mão de Obra (Prime Cost " + brlAcc(g.primeCost) + ")", value: g.margemAposMaoObra, kind: "total" },
    { label: "(−) Despesas Variáveis de Venda", value: -g.despesasVariaveis, kind: "sub" },
    { label: "= Margem de Contribuição", value: g.margemContribuicao, kind: "total" },
    { label: "(−) Estrutura e Operação", value: -g.estrutura, kind: "sub" },
    { label: "(−) Administração e Comercial", value: -g.administracao, kind: "sub" },
    { label: "(−) Pessoal Administrativo", value: -g.pessoalAdministrativo, kind: "sub" },
    { label: "(−) Pró-Labore", value: -g.proLabore, kind: "sub" },
    { label: "(−) Taxas, Multas e Outras Despesas Operacionais", value: -g.outrasOperacionais, kind: "sub" },
    { label: "(+) Outras Receitas", value: g.outrasReceitas, kind: "sub" },
    { label: "= EBITDA", value: g.ebitda, kind: "total" },
    { label: "(±) Resultado Financeiro", value: g.resultadoFinanceiro, kind: "sub" },
    { label: "= Resultado antes do IRPJ/CSLL", value: g.resultadoAntesIr, kind: "total" },
    { label: "(−) IRPJ e CSLL", value: -g.irpjCsll, kind: "sub" },
    { label: "= Resultado Líquido", value: g.resultadoLiquido, kind: "final" },
  ];


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
          <td>${escapeHtml(n.code)}</td>
          <td>${escapeHtml(n.name)}</td>
          <td class="num">${escapeHtml(fmt(Number(n.saldo_proprio || 0) * dreSign(n)))}</td>
        </tr>`
      )
      .join("");

    const html = `
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>DRE Gerencial ${escapeHtml(periodLabel)}</title>
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
        ${contextLabel ? `<div><strong>${escapeHtml(contextLabel)}</strong></div>` : ""}
        <div>Período: ${escapeHtml(periodLabel)} · Regime: ${escapeHtml(regimeLabel)}</div>
        <div>Gerado em ${escapeHtml(now)}</div>
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
          ${linhas.map((l) => `<tr class="${l.kind === "sub" ? "muted" : l.kind === "final" ? "bold highlight" : "bold"}"><td>${escapeHtml(l.label)}</td><td class="num">${fmt(l.value)}</td></tr>`).join("")}
        </tbody>
      </table>

      <h2>Detalhamento por Conta Contábil</h2>
      <table>
        <thead><tr><th style="width:90px;">Código</th><th>Conta</th><th class="num" style="width:140px;">Saldo</th></tr></thead>
        <tbody>${analyticRows || `<tr><td colspan="3" class="muted">Sem movimento no período.</td></tr>`}</tbody>
      </table>
      </body></html>
    `;
    // Quadro interno: não depende de pop-up liberado nem de script embutido.
    imprimirHtmlEmQuadro(html);
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
          {linhas.map((l) => (
            <SummaryRow
              key={l.label}
              label={l.label}
              value={l.value}
              muted={l.kind === "sub"}
              bold={l.kind !== "sub"}
              highlight={l.kind === "final"}
            />
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Gorjetas e taxa de serviço não entram no DRE: pertencem à equipe e ficam como valor a repassar.
          </p>
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

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function KpiCard({ title, value, subtitle }: { title: string; value: number; subtitle?: string }) {
  return (
    <Card data-testid={`dre-kpi-${slug(title)}`}>
      <CardContent className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
        <p
          data-testid={`dre-kpi-value-${slug(title)}`}
          className={cn("text-2xl font-bold tabular-nums", signClass(value))}
        >
          {brlAcc(value)}
        </p>
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
      data-testid={`dre-row-${slug(label)}`}
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md border-b border-border/40",
        highlight && "bg-primary/5",
        bold && "font-semibold"
      )}
    >
      <span className={cn("flex-1", muted && "text-muted-foreground")}>{label}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      <span
        data-testid={`dre-row-value-${slug(label)}`}
        className={cn("w-40 text-right tabular-nums", signClass(value))}
      >
        {brlAcc(value)}
      </span>
    </div>
  );
}
