import { useMemo, useState, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  parseISO,
  eachMonthOfInterval,
  isWithinInterval,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const formatBRL = (v: number) =>
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

type ReportTab = "resumo" | "categorias";

export default function Relatorios() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ReportTab>("resumo");
  const [startDate, setStartDate] = useState<Date>(subMonths(startOfMonth(new Date()), 5));
  const [endDate, setEndDate] = useState<Date>(endOfMonth(new Date()));
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: transactions = [] } = useQuery({
    queryKey: ["relatorios-tx", user?.id, startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("transactions")
        .select("amount, transaction_type, transaction_date, category_id, status")
        .eq("user_id", user!.id)
        .gte("transaction_date", format(startDate, "yyyy-MM-dd"))
        .lte("transaction_date", format(endDate, "yyyy-MM-dd"))
        .neq("status", "cancelado");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["relatorios-cats", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, color, transaction_type")
        .eq("user_id", user!.id);
      return data ?? [];
    },
  });

  // Monthly comparison data
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

  // Category breakdown
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
              <div class="card-value green">${formatBRL(totals.receitas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Despesas</div>
              <div class="card-value red">${formatBRL(totals.despesas)}</div>
            </div>
            <div class="card">
              <div class="card-label">Resultado</div>
              <div class="card-value ${totals.saldo >= 0 ? "green" : "red"}">${formatBRL(totals.saldo)}</div>
            </div>
          </div>

          <h2>Comparativo Mensal</h2>
          <table>
            <thead><tr><th>Mês</th><th class="right">Receitas</th><th class="right">Despesas</th><th class="right">Resultado</th></tr></thead>
            <tbody>
              ${monthlyData
                .map(
                  (m) =>
                    `<tr><td>${m.label}</td><td class="right green">${formatBRL(m.receitas)}</td><td class="right red">${formatBRL(m.despesas)}</td><td class="right ${m.receitas - m.despesas >= 0 ? "green" : "red"}">${formatBRL(m.receitas - m.despesas)}</td></tr>`
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
                    `<tr><td>${c.name}</td><td class="right">${formatBRL(c.value)}</td><td class="right">${totals.despesas > 0 ? ((c.value / totals.despesas) * 100).toFixed(1) : 0}%</td></tr>`
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

      {/* Period filter */}
      <div className="flex gap-3 flex-wrap items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal min-w-[150px]")}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              {format(startDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={(d) => d && setStartDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <span className="text-sm text-muted-foreground">até</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("justify-start text-left font-normal min-w-[150px]")}>
              <CalendarIcon className="h-4 w-4 mr-2" />
              {format(endDate, "dd/MM/yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={(d) => d && setEndDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)}>
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="categorias">Categorias</TabsTrigger>
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
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Pie chart */}
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Despesas por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Nenhuma despesa no período
                </div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                        fontSize={11}
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={entry.id} fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category table */}
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
                          style={{ backgroundColor: cat.color || PIE_COLORS[i % PIE_COLORS.length] }}
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
      )}
    </div>
  );
}
