import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Landmark } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { usePrivacy } from "@/hooks/usePrivacy";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const DONUT_COLORS = [
  "hsl(210, 52%, 45%)",
  "hsl(145, 55%, 42%)",
  "hsl(36, 90%, 55%)",
  "hsl(4, 78%, 57%)",
  "hsl(270, 50%, 55%)",
  "hsl(180, 50%, 40%)",
  "hsl(330, 60%, 50%)",
  "hsl(60, 70%, 45%)",
  "hsl(240, 45%, 55%)",
  "hsl(15, 75%, 50%)",
  "hsl(160, 55%, 35%)",
  "hsl(300, 40%, 50%)",
];

export default function Dashboard() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();

  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard-transactions", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
      let q = supabase
        .from("transactions")
        .select("amount, amount_paid, transaction_type, transaction_date, category_id, status, due_date")
        .eq("user_id", user!.id)
        .eq("context", contextType)
        .gte("transaction_date", startOfYear)
        .neq("status", "cancelado");
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["dashboard-categories", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("categories")
        .select("id, name, color")
        .eq("user_id", user!.id);
      if (contextType === "pf") q = q.or("context.is.null,context.eq.pf");
      else q = q.or("context.is.null,context.eq.pj");
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["dashboard-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("accounts")
        .select("name, current_balance, color, is_active")
        .eq("user_id", user!.id)
        .eq("is_active", true)
        .eq("context", contextType);
      if (contextType === "pj" && selectedCompanyId) q = q.eq("company_id", selectedCompanyId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const totalBankBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + Number(a.current_balance), 0),
    [accounts]
  );

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  );

  const { monthlyData, balanceEvolution, topCategories, totalReceitas, totalDespesas } = useMemo(() => {
    const months: Record<string, { receitas: number; despesas: number }> = {};
    const confirmedMonths: Record<string, { receitas: number; despesas: number }> = {};
    const catTotals: Record<string, number> = {};
    let totalR = 0;
    let totalD = 0;

    const isEffective = (t: typeof transactions[0]) =>
      t.status === "confirmado" || (t.due_date && Number(t.amount_paid) >= Number(t.amount));

    for (const t of transactions) {
      const month = t.transaction_date.slice(0, 7); // YYYY-MM
      if (!months[month]) months[month] = { receitas: 0, despesas: 0 };
      if (!confirmedMonths[month]) confirmedMonths[month] = { receitas: 0, despesas: 0 };

      if (t.transaction_type === "receita") {
        months[month].receitas += Number(t.amount);
        totalR += Number(t.amount);
        if (isEffective(t)) confirmedMonths[month].receitas += Number(t.amount);
      } else if (t.transaction_type === "despesa") {
        months[month].despesas += Number(t.amount);
        totalD += Number(t.amount);
        if (t.category_id) {
          catTotals[t.category_id] = (catTotals[t.category_id] ?? 0) + Number(t.amount);
        }
        if (isEffective(t)) confirmedMonths[month].despesas += Number(t.amount);
      }
    }

    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const sortedKeys = Object.keys(months).sort();
    const sorted = sortedKeys.map((key) => ({
      month: monthNames[parseInt(key.split("-")[1]) - 1],
      receitas: months[key].receitas,
      despesas: months[key].despesas,
    }));

    // Balance evolution: cumulative only from confirmed/effective transactions
    let cumulative = 0;
    const allKeys = [...new Set([...Object.keys(months), ...Object.keys(confirmedMonths)])].sort();
    const balEvo = allKeys.map((key) => {
      const cm = confirmedMonths[key] || { receitas: 0, despesas: 0 };
      cumulative += cm.receitas - cm.despesas;
      return {
        month: monthNames[parseInt(key.split("-")[1]) - 1],
        saldo: cumulative,
      };
    });

    const top5 = Object.entries(catTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([catId, total], i) => ({
        name: catMap[catId]?.name ?? "Sem categoria",
        value: total,
        fill: DONUT_COLORS[i % DONUT_COLORS.length],
      }));

    return { monthlyData: sorted, balanceEvolution: balEvo, topCategories: top5, totalReceitas: totalR, totalDespesas: totalD };
  }, [transactions, catMap]);

  const saldo = totalReceitas - totalDespesas;
  const changeR = totalReceitas > 0 ? `+${((totalReceitas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";
  const changeD = totalDespesas > 0 ? `-${((totalDespesas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";

  const kpis = [
    { label: "Saldo", value: maskBRL(saldo), icon: Wallet, positive: saldo >= 0 },
    { label: "Contas Bancárias", value: maskBRL(totalBankBalance), icon: Landmark, positive: totalBankBalance >= 0 },
    { label: "Receitas", value: maskBRL(totalReceitas), change: changeR, icon: TrendingUp, positive: true },
    { label: "Despesas", value: maskBRL(totalDespesas), change: changeD, icon: TrendingDown, positive: false },
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
                   <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
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
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
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

      {/* Balance Evolution */}
      {balanceEvolution.length > 1 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Evolução do Saldo</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{ saldo: { label: "Saldo", color: "hsl(210, 52%, 45%)" } }} className="h-48 w-full">
              <AreaChart data={balanceEvolution} accessibilityLayer>
                <defs>
                  <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210, 52%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(210, 52%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
                <Area type="monotone" dataKey="saldo" stroke="hsl(210, 52%, 45%)" fill="url(#saldoGradient)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {accounts.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Saldo por Conta Bancária</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((acc, i) => {
                const balance = Number(acc.current_balance);
                return (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color || "hsl(var(--primary))" }}
                      />
                      <span className="text-sm font-medium truncate">{acc.name}</span>
                    </div>
                    <span className={`text-sm font-bold shrink-0 ml-2 ${balance >= 0 ? "text-success" : "text-destructive"}`}>
                      {maskBRL(balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
