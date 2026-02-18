import { useMemo, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  CalendarIcon,
  Download,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Printer,
  
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  parseISO,
  eachMonthOfInterval,
  isWithinInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

type PeriodPreset = "month" | "3months" | "6months" | "year" | "custom";

function getPeriodRange(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "3months":
      return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
    case "6months":
      return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
    case "year":
    default:
      return { from: startOfYear(now), to: endOfYear(now) };
  }
}

const formatBRLRaw = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PIE_COLORS = [
  "hsl(210, 52%, 45%)",
  "hsl(145, 50%, 42%)",
  "hsl(4, 78%, 57%)",
  "hsl(38, 92%, 50%)",
  "hsl(262, 52%, 56%)",
  "hsl(190, 70%, 42%)",
  "hsl(330, 60%, 52%)",
  "hsl(80, 50%, 45%)",
  "hsl(20, 80%, 52%)",
  "hsl(160, 50%, 40%)",
];

const barConfig: ChartConfig = {
  receitas: { label: "Receitas", color: "hsl(145, 50%, 42%)" },
  despesas: { label: "Despesas", color: "hsl(4, 78%, 57%)" },
};

type ReportTab = "resumo" | "categorias" | "fluxo-caixa";

export default function Relatorios() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const formatBRL = maskBRL;
  const [tab, setTab] = useState<ReportTab>("resumo");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("6months");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(getPeriodRange("6months"));
  const reportRef = useRef<HTMLDivElement>(null);
  const [fluxoYear, setFluxoYear] = useState(new Date().getFullYear());
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const activeRange = periodPreset === "custom" ? customRange : getPeriodRange(periodPreset);
  const startDate = activeRange.from;
  const endDate = activeRange.to;

  const { data: transactions = [] } = useQuery({
    queryKey: ["relatorios-tx", user?.id, startDate, endDate, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("amount, transaction_type, transaction_date, category_id, status")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .gte("transaction_date", format(startDate, "yyyy-MM-dd"))
        .lte("transaction_date", format(endDate, "yyyy-MM-dd"))
        .neq("status", "cancelado");
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["relatorios-cats", user?.id, contextType],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("id, name, color, transaction_type, parent_id, hierarchy_index, sort_order")
        .eq("user_id", user!.id);
      if (contextType === "pf") q = q.or("context.is.null,context.eq.pf");
      else q = q.or("context.is.null,context.eq.pj");
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fluxo de Caixa - full year query
  const { data: fluxoTransactions = [] } = useQuery({
    queryKey: ["relatorios-fluxo", user?.id, fluxoYear, contextType, selectedCompanyId],
    enabled: !!user && tab === "fluxo-caixa",
    queryFn: async () => {
      let q = supabase
        .from("transactions")
        .select("amount, amount_paid, transaction_type, transaction_date, category_id, status, due_date")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .gte("transaction_date", `${fluxoYear}-01-01`)
        .lte("transaction_date", `${fluxoYear}-12-31`)
        .neq("status", "cancelado");
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fluxo de Caixa data processing with hierarchy
  type FluxoNode = {
    id: string;
    name: string;
    hierarchyIndex: string;
    type: string;
    months: number[];
    children: FluxoNode[];
    depth: number;
  };

  const fluxoCaixaData = useMemo(() => {
    const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));

    // Build monthly totals by leaf category
    const catMonthly: Record<string, number[]> = {};
    const totalReceitas = new Array(12).fill(0);
    const totalDespesas = new Array(12).fill(0);

    for (const t of fluxoTransactions) {
      const d = parseISO(t.transaction_date);
      const monthIdx = d.getMonth();
      const catId = t.category_id ?? "sem-categoria";
      const amount = Number(t.amount);

      if (!catMonthly[catId]) catMonthly[catId] = new Array(12).fill(0);
      catMonthly[catId][monthIdx] += amount;

      if (t.transaction_type === "receita") totalReceitas[monthIdx] += amount;
      else if (t.transaction_type === "despesa") totalDespesas[monthIdx] += amount;
    }

    const totalSaldo = totalReceitas.map((r, i) => r - totalDespesas[i]);

    const sumArr = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
    const avgArr = (arr: number[]) => {
      const nonZero = arr.filter((v) => v !== 0);
      return nonZero.length > 0 ? sumArr(arr) / nonZero.length : 0;
    };

    // Build hierarchical tree for each type
    function buildTree(type: string): FluxoNode[] {
      // Get all categories of this type that have data (directly or via children)
      const relevantCatIds = new Set<string>();
      
      // First, find all leaf cats with data
      for (const catId of Object.keys(catMonthly)) {
        const cat = catMap[catId];
        if (!cat) {
          if (type === "despesa") relevantCatIds.add(catId); // sem-categoria defaults to despesa
          continue;
        }
        if (cat.transaction_type === type) relevantCatIds.add(catId);
      }

      // Walk up to include all ancestors
      for (const catId of [...relevantCatIds]) {
        let current = catMap[catId];
        while (current?.parent_id) {
          relevantCatIds.add(current.parent_id);
          current = catMap[current.parent_id];
        }
      }

      // Build nodes
      const nodeMap: Record<string, FluxoNode> = {};
      for (const catId of relevantCatIds) {
        const cat = catMap[catId];
        nodeMap[catId] = {
          id: catId,
          name: cat?.name ?? "Sem categoria",
          hierarchyIndex: cat?.hierarchy_index ?? "",
          type,
          months: catMonthly[catId] ? [...catMonthly[catId]] : new Array(12).fill(0),
          children: [],
          depth: 0,
        };
      }

      // Link parent-child
      const roots: FluxoNode[] = [];
      for (const catId of relevantCatIds) {
        const cat = catMap[catId];
        const node = nodeMap[catId];
        if (cat?.parent_id && nodeMap[cat.parent_id]) {
          nodeMap[cat.parent_id].children.push(node);
        } else {
          roots.push(node);
        }
      }

      // Aggregate children months into parents (bottom-up)
      function aggregate(node: FluxoNode): number[] {
        if (node.children.length === 0) return node.months;
        let childSum = new Array(12).fill(0);
        for (const child of node.children) {
          const childMonths = aggregate(child);
          childSum = childSum.map((v, i) => v + childMonths[i]);
        }
        // Parent months = own direct months + children sum
        node.months = node.months.map((v, i) => v + childSum[i]);
        return node.months;
      }

      // Sort children by hierarchy_index or sort_order
      function sortNodes(nodes: FluxoNode[]) {
        nodes.sort((a, b) => {
          const catA = catMap[a.id];
          const catB = catMap[b.id];
          const orderA = catA?.sort_order ?? 0;
          const orderB = catB?.sort_order ?? 0;
          if (orderA !== orderB) return orderA - orderB;
          return (a.hierarchyIndex || a.name).localeCompare(b.hierarchyIndex || b.name);
        });
        for (const n of nodes) sortNodes(n.children);
      }

      for (const root of roots) aggregate(root);
      sortNodes(roots);

      return roots;
    }

    const receitaTree = buildTree("receita");
    const despesaTree = buildTree("despesa");

    return {
      MONTH_LABELS,
      totalReceitas,
      totalDespesas,
      totalSaldo,
      receitaTree,
      despesaTree,
      sumArr,
      avgArr,
    };
  }, [fluxoTransactions, categories]);

  // Flatten tree respecting collapsed state
  const flattenTree = (nodes: FluxoNode[], depth: number): FluxoNode[] => {
    const result: FluxoNode[] = [];
    for (const node of nodes) {
      result.push({ ...node, depth });
      if (node.children.length > 0 && !collapsedIds.has(node.id)) {
        result.push(...flattenTree(node.children, depth + 1));
      }
    }
    return result;
  };

  const flatReceitas = useMemo(() => flattenTree(fluxoCaixaData.receitaTree, 0), [fluxoCaixaData.receitaTree, collapsedIds]);
  const flatDespesas = useMemo(() => flattenTree(fluxoCaixaData.despesaTree, 0), [fluxoCaixaData.despesaTree, collapsedIds]);

  const monthlyData = useMemo(() => {
    const months = eachMonthOfInterval({ start: startDate, end: endDate });
    return months.map((m) => {
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      let receitas = 0;
      let despesas = 0;
      for (const t of transactions) {
        const d = parseISO(t.transaction_date);
        if (isWithinInterval(d, { start: mStart, end: mEnd })) {
          if (t.transaction_type === "receita") receitas += Number(t.amount);
          else if (t.transaction_type === "despesa") despesas += Number(t.amount);
        }
      }
      return {
        label: format(m, "MMM yy", { locale: ptBR }),
        receitas,
        despesas,
      };
    });
  }, [transactions, startDate, endDate]);

  // Category breakdown - Despesas
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.transaction_type !== "despesa") continue;
      const catId = t.category_id ?? "sem-categoria";
      map[catId] = (map[catId] ?? 0) + Number(t.amount);
    }
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
    return Object.entries(map)
      .map(([id, value]) => ({
        id,
        name: catMap[id]?.name ?? "Sem categoria",
        color: catMap[id]?.color ?? "#94a3b8",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories]);

  // Category breakdown - Receitas
  const receitaCategoryData = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) {
      if (t.transaction_type !== "receita") continue;
      const catId = t.category_id ?? "sem-categoria";
      map[catId] = (map[catId] ?? 0) + Number(t.amount);
    }
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
    return Object.entries(map)
      .map(([id, value]) => ({
        id,
        name: catMap[id]?.name ?? "Sem categoria",
        color: catMap[id]?.color ?? "#94a3b8",
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories]);

  // Totals
  const totals = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    for (const t of transactions) {
      if (t.transaction_type === "receita") receitas += Number(t.amount);
      else if (t.transaction_type === "despesa") despesas += Number(t.amount);
    }
    return { receitas, despesas, saldo: receitas - despesas };
  }, [transactions]);

  const handleExportPDF = async () => {
    try {
      const printContent = reportRef.current;
      if (!printContent) return;

      const printWindow = window.open("", "_blank");
      if (!printWindow) return;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Relatório Financeiro</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
            .subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
            .cards { display: flex; gap: 16px; margin-bottom: 24px; }
            .card { border: 1px solid #e2e2e2; border-radius: 8px; padding: 16px; flex: 1; }
            .card-label { font-size: 12px; color: #666; margin-bottom: 4px; }
            .card-value { font-size: 20px; font-weight: bold; }
            .green { color: #16a34a; }
            .red { color: #dc2626; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e2e2; font-size: 13px; }
            th { background: #f5f5f5; font-weight: 600; }
            .right { text-align: right; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Relatório Financeiro</h1>
          <p class="subtitle">Período: ${format(startDate, "dd/MM/yyyy")} a ${format(endDate, "dd/MM/yyyy")}</p>
          
          <div class="cards">
            <div class="card">
              <div class="card-label">Total Receitas</div>
              <div class="card-value green">${formatBRLRaw(totals.receitas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Despesas</div>
              <div class="card-value red">${formatBRLRaw(totals.despesas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Resultado</div>
              <div class="card-value ${totals.saldo >= 0 ? "green" : "red"}">${formatBRLRaw(totals.saldo)}</div>
            </div>
          </div>

          <h2>Comparativo Mensal</h2>
          <table>
            <thead><tr><th>Mês</th><th class="right">Receitas</th><th class="right">Despesas</th><th class="right">Resultado</th></tr></thead>
            <tbody>
              ${monthlyData
                .map(
                  (m) =>
                    `<tr><td>${m.label}</td><td class="right green">${formatBRLRaw(m.receitas)}</td><td class="right red">${formatBRLRaw(m.despesas)}</td><td class="right ${m.receitas - m.despesas >= 0 ? "green" : "red"}">${formatBRLRaw(m.receitas - m.despesas)}</td></tr>`
                )
                .join("")}
            </tbody>
          </table>

          <h2>Despesas por Categoria</h2>
          <table>
            <thead><tr><th>Categoria</th><th class="right">Valor</th><th class="right">%</th></tr></thead>
            <tbody>
              ${categoryData
                .map(
                  (c) =>
                    `<tr><td>${c.name}</td><td class="right">${formatBRLRaw(c.value)}</td><td class="right">${totals.despesas > 0 ? ((c.value / totals.despesas) * 100).toFixed(1) : 0}%</td></tr>`
                )
                .join("")}
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    } catch {
      // fallback: do nothing
    }
  };

  return (
    <div className="space-y-6" ref={reportRef}>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Analise suas finanças com relatórios detalhados</p>
        </div>
        <Button variant="outline" onClick={handleExportPDF}>
          <Download className="h-4 w-4 mr-2" /> Exportar PDF
        </Button>
      </div>

      {/* Period filter + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { key: "month", label: "Mês" },
            { key: "3months", label: "3 Meses" },
            { key: "6months", label: "6 Meses" },
            { key: "year", label: "Ano" },
          ] as { key: PeriodPreset; label: string }[]).map((p) => (
            <Button
              key={p.key}
              variant={periodPreset === p.key ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriodPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={periodPreset === "custom" ? "default" : "outline"}
                size="sm"
                className="gap-1"
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {periodPreset === "custom"
                  ? `${format(customRange.from, "dd/MM/yy")} - ${format(customRange.to, "dd/MM/yy")}`
                  : "Personalizado"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: customRange.from, to: customRange.to }}
                onSelect={(range) => {
                  if (range?.from) {
                    setCustomRange({ from: range.from, to: range.to ?? range.from });
                    setPeriodPreset("custom");
                  }
                }}
                numberOfMonths={2}
                locale={ptBR}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
            <TabsTrigger value="fluxo-caixa">Fluxo de Caixa</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Receitas</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-success">{formatBRL(totals.receitas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Despesas</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-destructive">{formatBRL(totals.despesas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Resultado</CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${totals.saldo >= 0 ? "text-success" : "text-destructive"}`}>
              {formatBRL(totals.saldo)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      {tab === "resumo" ? (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Comparativo Mensal — Receitas vs Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                Nenhuma movimentação no período
              </div>
            ) : (
              <ChartContainer config={barConfig} className="h-72 w-full">
                <BarChart data={monthlyData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    width={50}
                  />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      ) : tab === "categorias" ? (
        <div className="space-y-6">
          {/* Despesas */}
          <h2 className="text-lg font-semibold">Despesas por Categoria</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Distribuição</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Nenhuma despesa no período
                  </div>
                ) : (
                  <>
                    <ChartContainer
                      config={Object.fromEntries(
                        categoryData.map((c, i) => [
                          c.id,
                          { label: c.name, color: PIE_COLORS[i % PIE_COLORS.length] },
                        ])
                      )}
                      className="h-80 w-full"
                    >
                      <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          cornerRadius={4}
                        >
                          {categoryData.map((_entry, index) => (
                            <Cell key={_entry.id} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => formatBRL(Number(value))}
                              nameKey="name"
                            />
                          }
                        />
                      </PieChart>
                    </ChartContainer>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
                      {categoryData.map((cat, i) => (
                        <div key={cat.id} className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-xs text-muted-foreground">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Detalhamento</CardTitle>
              </CardHeader>
              <CardContent>
                {categoryData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
                ) : (
                  <div className="space-y-3">
                    {categoryData.map((cat, i) => {
                      const pct = totals.despesas > 0 ? (cat.value / totals.despesas) * 100 : 0;
                      return (
                        <div key={cat.id} className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-sm flex-1 truncate">{cat.name}</span>
                          <span className="text-sm font-medium tabular-nums">{formatBRL(cat.value)}</span>
                          <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Receitas */}
          <h2 className="text-lg font-semibold">Receitas por Categoria</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Distribuição</CardTitle>
              </CardHeader>
              <CardContent>
                {receitaCategoryData.length === 0 ? (
                  <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                    Nenhuma receita no período
                  </div>
                ) : (
                  <>
                    <ChartContainer
                      config={Object.fromEntries(
                        receitaCategoryData.map((c, i) => [
                          c.id,
                          { label: c.name, color: PIE_COLORS[i % PIE_COLORS.length] },
                        ])
                      )}
                      className="h-80 w-full"
                    >
                      <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                        <Pie
                          data={receitaCategoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          dataKey="value"
                          nameKey="name"
                          paddingAngle={2}
                          cornerRadius={4}
                        >
                          {receitaCategoryData.map((_entry, index) => (
                            <Cell key={_entry.id} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => formatBRL(Number(value))}
                              nameKey="name"
                            />
                          }
                        />
                      </PieChart>
                    </ChartContainer>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
                      {receitaCategoryData.map((cat, i) => (
                        <div key={cat.id} className="flex items-center gap-1.5">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-xs text-muted-foreground">{cat.name}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Detalhamento</CardTitle>
              </CardHeader>
              <CardContent>
                {receitaCategoryData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
                ) : (
                  <div className="space-y-3">
                    {receitaCategoryData.map((cat, i) => {
                      const pct = totals.receitas > 0 ? (cat.value / totals.receitas) * 100 : 0;
                      return (
                        <div key={cat.id} className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-sm flex-1 truncate">{cat.name}</span>
                          <span className="text-sm font-medium tabular-nums">{formatBRL(cat.value)}</span>
                          <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                            {pct.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : tab === "fluxo-caixa" ? (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-base">Fluxo de Caixa Anual</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFluxoYear((y) => y - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold w-12 text-center">{fluxoYear}</span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setFluxoYear((y) => y + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="ml-2 gap-1"
                onClick={() => {
                  const printWindow = window.open("", "_blank");
                  if (!printWindow) return;
                  const tableEl = document.getElementById("fluxo-caixa-table");
                  if (!tableEl) return;
                  printWindow.document.write(`
                    <!DOCTYPE html><html><head><title>Fluxo de Caixa ${fluxoYear}</title>
                    <style>
                      body { font-family: Arial, sans-serif; font-size: 10px; }
                      table { width: 100%; border-collapse: collapse; }
                      th, td { padding: 4px 6px; border: 1px solid #ddd; text-align: right; white-space: nowrap; }
                      th { background: #f5f5f5; }
                      td:first-child, th:first-child { text-align: left; }
                      .receita { color: #16a34a; } .despesa { color: #dc2626; } .saldo-pos { color: #2563eb; } .saldo-neg { color: #dc2626; }
                      .header-row { background: #f0f0f0; font-weight: bold; }
                      .cat-row td:first-child { padding-left: 24px; }
                      @media print { body { padding: 0; } }
                    </style></head><body>
                    <h2>Fluxo de Caixa — ${fluxoYear}</h2>
                    ${tableEl.outerHTML}
                    </body></html>
                  `);
                  printWindow.document.close();
                  printWindow.print();
                }}
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir
              </Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table id="fluxo-caixa-table" className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold text-muted-foreground sticky left-0 bg-card min-w-[180px]"></th>
                  {fluxoCaixaData.MONTH_LABELS.map((m) => (
                    <th key={m} className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[90px]">{m}</th>
                  ))}
                  <th className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[90px]">MÉDIA</th>
                  <th className="text-right py-2 px-2 font-semibold text-muted-foreground min-w-[100px]">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {/* Receitas row */}
                <tr className="border-b bg-muted/30 font-semibold">
                  <td className="py-2 px-2 text-success sticky left-0 bg-muted/30">Receitas</td>
                  {fluxoCaixaData.totalReceitas.map((v, i) => (
                    <td key={i} className="text-right py-2 px-2 text-success tabular-nums">
                      {v > 0 ? formatBRL(v) : "-"}
                    </td>
                  ))}
                  <td className="text-right py-2 px-2 text-success tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalReceitas))}</td>
                  <td className="text-right py-2 px-2 text-success tabular-nums font-bold">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalReceitas))}</td>
                </tr>
                {/* Despesas row */}
                <tr className="border-b bg-muted/30 font-semibold">
                  <td className="py-2 px-2 text-destructive sticky left-0 bg-muted/30">Despesas</td>
                  {fluxoCaixaData.totalDespesas.map((v, i) => (
                    <td key={i} className="text-right py-2 px-2 text-destructive tabular-nums">
                      {v > 0 ? formatBRL(v) : "-"}
                    </td>
                  ))}
                  <td className="text-right py-2 px-2 text-destructive tabular-nums">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalDespesas))}</td>
                  <td className="text-right py-2 px-2 text-destructive tabular-nums font-bold">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalDespesas))}</td>
                </tr>
                {/* Saldo row */}
                <tr className="border-b-2 bg-muted/50 font-bold">
                  <td className="py-2 px-2 text-primary sticky left-0 bg-muted/50">SALDO</td>
                  {fluxoCaixaData.totalSaldo.map((v, i) => (
                    <td key={i} className={cn("text-right py-2 px-2 tabular-nums", v >= 0 ? "text-primary" : "text-destructive")}>
                      {v !== 0 ? formatBRL(v) : "-"}
                    </td>
                  ))}
                  <td className={cn("text-right py-2 px-2 tabular-nums", fluxoCaixaData.avgArr(fluxoCaixaData.totalSaldo) >= 0 ? "text-primary" : "text-destructive")}>
                    {formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalSaldo))}
                  </td>
                  <td className={cn("text-right py-2 px-2 tabular-nums font-bold", fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo) >= 0 ? "text-primary" : "text-destructive")}>
                    {formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalSaldo))}
                  </td>
                </tr>

                {/* Spacer */}
                <tr><td colSpan={15} className="py-1 px-2 text-muted-foreground font-semibold text-xs border-b bg-muted/20">Categorias (Detalhamento)</td></tr>

                {/* Receitas categories */}
                {flatReceitas.length > 0 && (
                  <>
                    <tr className="border-b bg-success/5">
                      <td className="py-1.5 px-2 font-semibold text-success sticky left-0 bg-success/5">RECEITAS</td>
                      {fluxoCaixaData.totalReceitas.map((v, i) => (
                        <td key={i} className="text-right py-1.5 px-2 text-success tabular-nums font-medium">{v > 0 ? formatBRL(v) : "-"}</td>
                      ))}
                      <td className="text-right py-1.5 px-2 text-success tabular-nums font-medium">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalReceitas))}</td>
                      <td className="text-right py-1.5 px-2 text-success tabular-nums font-bold">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalReceitas))}</td>
                    </tr>
                    {flatReceitas.map((node) => {
                      const hasChildren = node.children.length > 0;
                      const isCollapsed = collapsedIds.has(node.id);
                      const paddingLeft = 12 + node.depth * 16;
                      return (
                        <tr key={node.id + "-" + node.depth} className={cn("border-b hover:bg-muted/30", hasChildren && "bg-muted/10")}>
                          <td
                            className={cn("py-1.5 px-2 sticky left-0", hasChildren ? "font-semibold text-foreground cursor-pointer select-none bg-muted/10" : "text-muted-foreground bg-card")}
                            style={{ paddingLeft }}
                            onClick={hasChildren ? () => toggleCollapse(node.id) : undefined}
                          >
                            <span className="inline-flex items-center gap-1">
                              {hasChildren && (
                                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform shrink-0", !isCollapsed && "rotate-90")} />
                              )}
                              {node.hierarchyIndex ? `${node.hierarchyIndex}. ` : ""}{node.name}
                            </span>
                          </td>
                          {node.months.map((v, i) => (
                            <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-medium text-foreground" : "text-foreground")}>
                              {v > 0 ? formatBRL(v) : "-"}
                            </td>
                          ))}
                          <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren && "font-medium")}>{formatBRL(fluxoCaixaData.avgArr(node.months))}</td>
                          <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-bold" : "font-medium")}>{formatBRL(fluxoCaixaData.sumArr(node.months))}</td>
                        </tr>
                      );
                    })}
                  </>
                )}

                {/* Despesas categories */}
                {flatDespesas.length > 0 && (
                  <>
                    <tr className="border-b bg-destructive/5">
                      <td className="py-1.5 px-2 font-semibold text-destructive sticky left-0 bg-destructive/5">DESPESAS</td>
                      {fluxoCaixaData.totalDespesas.map((v, i) => (
                        <td key={i} className="text-right py-1.5 px-2 text-destructive tabular-nums font-medium">{v > 0 ? formatBRL(v) : "-"}</td>
                      ))}
                      <td className="text-right py-1.5 px-2 text-destructive tabular-nums font-medium">{formatBRL(fluxoCaixaData.avgArr(fluxoCaixaData.totalDespesas))}</td>
                      <td className="text-right py-1.5 px-2 text-destructive tabular-nums font-bold">{formatBRL(fluxoCaixaData.sumArr(fluxoCaixaData.totalDespesas))}</td>
                    </tr>
                    {flatDespesas.map((node) => {
                      const hasChildren = node.children.length > 0;
                      const isCollapsed = collapsedIds.has(node.id);
                      const paddingLeft = 12 + node.depth * 16;
                      return (
                        <tr key={node.id + "-" + node.depth} className={cn("border-b hover:bg-muted/30", hasChildren && "bg-muted/10")}>
                          <td
                            className={cn("py-1.5 px-2 sticky left-0", hasChildren ? "font-semibold text-foreground cursor-pointer select-none bg-muted/10" : "text-muted-foreground bg-card")}
                            style={{ paddingLeft }}
                            onClick={hasChildren ? () => toggleCollapse(node.id) : undefined}
                          >
                            <span className="inline-flex items-center gap-1">
                              {hasChildren && (
                                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform shrink-0", !isCollapsed && "rotate-90")} />
                              )}
                              {node.hierarchyIndex ? `${node.hierarchyIndex}. ` : ""}{node.name}
                            </span>
                          </td>
                          {node.months.map((v, i) => (
                            <td key={i} className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-medium text-foreground" : "text-foreground")}>
                              {v > 0 ? formatBRL(v) : "-"}
                            </td>
                          ))}
                          <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren && "font-medium")}>{formatBRL(fluxoCaixaData.avgArr(node.months))}</td>
                          <td className={cn("text-right py-1.5 px-2 tabular-nums", hasChildren ? "font-bold" : "font-medium")}>{formatBRL(fluxoCaixaData.sumArr(node.months))}</td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
            {fluxoTransactions.length === 0 && (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Nenhuma movimentação em {fluxoYear}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
