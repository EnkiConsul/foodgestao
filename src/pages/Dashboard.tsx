import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";

const DONUT_COLORS = [
  "hsl(210, 52%, 23%)",
  "hsl(145, 50%, 42%)",
  "hsl(36, 90%, 55%)",
  "hsl(4, 78%, 57%)",
  "hsl(270, 50%, 55%)",
];

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Dashboard() {
  const { user } = useAuth();

  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard-transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      const { data } = await supabase
        .from("transactions")
        .select("amount, transaction_type, transaction_date, category_id, status")
        .eq("user_id", user!.id)
        .gte("transaction_date", startOfYear)
        .neq("status", "cancelado");
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["dashboard-categories", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name, color")
        .eq("user_id", user!.id);
      return data ?? [];
    },
  });

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const { monthlyData, topCategories, totalReceitas, totalDespesas } = useMemo(() => {
    const months: Record<string, { receitas: number; despesas: number }> = {};
    const catTotals: Record<string, number> = {};
    let totalR = 0;
    let totalD = 0;

    for (const t of transactions) {
      const month = t.transaction_date.slice(0, 7); // YYYY-MM
      if (!months[month]) months[month] = { receitas: 0, despesas: 0 };

      if (t.transaction_type === "receita") {
        months[month].receitas += Number(t.amount);
        totalR += Number(t.amount);
      } else if (t.transaction_type === "despesa") {
        months[month].despesas += Number(t.amount);
        totalD += Number(t.amount);
        if (t.category_id) {
          catTotals[t.category_id] = (catTotals[t.category_id] ?? 0) + Number(t.amount);
        }
      }
    }

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const sorted = Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        month: monthNames[parseInt(key.split("-")[1]) - 1],
        receitas: val.receitas,
        despesas: val.despesas,
      }));

    const top5 = Object.entries(catTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([catId, total], i) => ({
        name: catMap[catId]?.name ?? "Sem categoria",
        value: total,
        fill: catMap[catId]?.color ?? DONUT_COLORS[i % DONUT_COLORS.length],
      }));

    return { monthlyData: sorted, topCategories: top5, totalReceitas: totalR, totalDespesas: totalD };
  }, [transactions, catMap]);

  const saldo = totalReceitas - totalDespesas;
  const changeR = totalReceitas > 0 ? `+${((totalReceitas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";
  const changeD = totalDespesas > 0 ? `-${((totalDespesas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";

  const kpis = [
    { label: "Saldo", value: formatBRL(saldo), icon: Wallet, positive: saldo >= 0 },
    { label: "Receitas", value: formatBRL(totalReceitas), change: changeR, icon: TrendingUp, positive: true },
    { label: "Despesas", value: formatBRL(totalDespesas), change: changeD, icon: TrendingDown, positive: false },
    { label: "Transações", value: String(transactions.length), icon: Target, positive: true },
  ];

  const barConfig: ChartConfig = {
    receitas: { label: "Receitas", color: "hsl(145, 50%, 42%)" },
    despesas: { label: "Despesas", color: "hsl(4, 78%, 57%)" },
  };

  const donutConfig: ChartConfig = Object.fromEntries(
    topCategories.map((c) => [c.name, { label: c.name, color: c.fill }])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral das suas finanças</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.positive ? "text-success" : "text-destructive"}`} />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{kpi.value}</div>
              {kpi.change && (
                <p className={`text-xs mt-1 ${kpi.positive ? "text-success" : "text-destructive"}`}>
                  {kpi.change}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Receitas vs Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nenhuma transação registrada ainda
              </div>
            ) : (
              <ChartContainer config={barConfig} className="h-48 w-full">
                <BarChart data={monthlyData} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Top 5 Categorias (Despesas)</CardTitle>
          </CardHeader>
          <CardContent>
            {topCategories.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                Nenhuma despesa categorizada ainda
              </div>
            ) : (
              <ChartContainer config={donutConfig} className="h-48 w-full">
                <PieChart accessibilityLayer>
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
                  <Pie data={topCategories} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {topCategories.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
