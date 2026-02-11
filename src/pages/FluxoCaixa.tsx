import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, Wallet, CalendarDays } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  eachWeekOfInterval,
  startOfWeek,
  endOfWeek,
  addMonths,
  isSameDay,
  isSameWeek,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type Granularity = "diario" | "semanal" | "mensal";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const chartConfig: ChartConfig = {
  receitas: { label: "Receitas", color: "hsl(145, 50%, 42%)" },
  despesas: { label: "Despesas", color: "hsl(4, 78%, 57%)" },
  saldo: { label: "Saldo Acumulado", color: "hsl(210, 52%, 23%)" },
};

export default function FluxoCaixa() {
  const { user } = useAuth();
  const [granularity, setGranularity] = useState<Granularity>("diario");

  // Fetch transactions for current month + next month (projection)
  const { data: transactions = [] } = useQuery({
    queryKey: ["fluxo-caixa-transactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const start = startOfMonth(new Date());
      const end = endOfMonth(addMonths(new Date(), 1));
      const { data } = await supabase
        .from("transactions")
        .select("amount, transaction_type, transaction_date, status")
        .eq("user_id", user!.id)
        .gte("transaction_date", format(start, "yyyy-MM-dd"))
        .lte("transaction_date", format(end, "yyyy-MM-dd"))
        .neq("status", "cancelado");
      return data ?? [];
    },
  });

  // Fetch bills for projection
  const { data: bills = [] } = useQuery({
    queryKey: ["fluxo-caixa-bills", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const start = new Date();
      const end = endOfMonth(addMonths(new Date(), 1));
      const { data } = await supabase
        .from("bills")
        .select("amount, amount_paid, bill_type, due_date, status")
        .eq("user_id", user!.id)
        .gte("due_date", format(start, "yyyy-MM-dd"))
        .lte("due_date", format(end, "yyyy-MM-dd"))
        .neq("status", "pago");
      return data ?? [];
    },
  });

  // Fetch current total balance
  const { data: accounts = [] } = useQuery({
    queryKey: ["fluxo-caixa-accounts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("accounts")
        .select("current_balance")
        .eq("user_id", user!.id)
        .eq("is_active", true);
      return data ?? [];
    },
  });

  const currentBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.current_balance), 0),
    [accounts]
  );

  const chartData = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(addMonths(new Date(), 1));

    // Build daily map of realized transactions
    const dailyMap: Record<string, { receitas: number; despesas: number }> = {};

    for (const t of transactions) {
      const key = t.transaction_date;
      if (!dailyMap[key]) dailyMap[key] = { receitas: 0, despesas: 0 };
      if (t.transaction_type === "receita") dailyMap[key].receitas += Number(t.amount);
      else if (t.transaction_type === "despesa") dailyMap[key].despesas += Number(t.amount);
    }

    // Add projected bills
    for (const b of bills) {
      const remaining = Number(b.amount) - Number(b.amount_paid);
      if (remaining <= 0) continue;
      const key = b.due_date;
      if (!dailyMap[key]) dailyMap[key] = { receitas: 0, despesas: 0 };
      if (b.bill_type === "receita") dailyMap[key].receitas += remaining;
      else dailyMap[key].despesas += remaining;
    }

    if (granularity === "diario") {
      const days = eachDayOfInterval({ start, end });
      let runningBalance = currentBalance;
      return days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const d = dailyMap[key] || { receitas: 0, despesas: 0 };
        runningBalance += d.receitas - d.despesas;
        return {
          label: format(day, "dd/MM"),
          receitas: d.receitas,
          despesas: d.despesas,
          saldo: runningBalance,
        };
      });
    }

    if (granularity === "semanal") {
      const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      let runningBalance = currentBalance;
      return weeks.map((weekStart) => {
        const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        let receitas = 0;
        let despesas = 0;
        Object.entries(dailyMap).forEach(([dateStr, val]) => {
          const d = parseISO(dateStr);
          if (d >= weekStart && d <= wEnd) {
            receitas += val.receitas;
            despesas += val.despesas;
          }
        });
        runningBalance += receitas - despesas;
        return {
          label: `${format(weekStart, "dd/MM")} - ${format(wEnd, "dd/MM")}`,
          receitas,
          despesas,
          saldo: runningBalance,
        };
      });
    }

    // mensal
    const months = [start, addMonths(start, 1)];
    let runningBalance = currentBalance;
    return months.map((m) => {
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      let receitas = 0;
      let despesas = 0;
      Object.entries(dailyMap).forEach(([dateStr, val]) => {
        const d = parseISO(dateStr);
        if (d >= mStart && d <= mEnd) {
          receitas += val.receitas;
          despesas += val.despesas;
        }
      });
      runningBalance += receitas - despesas;
      return {
        label: format(m, "MMM yyyy", { locale: ptBR }),
        receitas,
        despesas,
        saldo: runningBalance,
      };
    });
  }, [transactions, bills, granularity, currentBalance]);

  const projectedTotals = useMemo(() => {
    const totalReceitas = chartData.reduce((s, d) => s + d.receitas, 0);
    const totalDespesas = chartData.reduce((s, d) => s + d.despesas, 0);
    const projectedBalance = chartData.length > 0 ? chartData[chartData.length - 1].saldo : currentBalance;
    return { totalReceitas, totalDespesas, projectedBalance };
  }, [chartData, currentBalance]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">Acompanhe entradas, saídas e projeções</p>
        </div>
        <Tabs value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
          <TabsList>
            <TabsTrigger value="diario">Diário</TabsTrigger>
            <TabsTrigger value="semanal">Semanal</TabsTrigger>
            <TabsTrigger value="mensal">Mensal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Atual</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatBRL(currentBalance)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Entradas Previstas</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-success">{formatBRL(projectedTotals.totalReceitas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saídas Previstas</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-destructive">{formatBRL(projectedTotals.totalDespesas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Projetado</CardTitle>
            <CalendarDays className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${projectedTotals.projectedBalance >= 0 ? "text-success" : "text-destructive"}`}>
              {formatBRL(projectedTotals.projectedBalance)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Fluxo de Caixa — {granularity === "diario" ? "Diário" : granularity === "semanal" ? "Semanal" : "Mensal"}</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Nenhuma movimentação no período
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-72 w-full">
              <AreaChart data={chartData} accessibilityLayer>
                <defs>
                  <linearGradient id="gradReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(4, 78%, 57%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(4, 78%, 57%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210, 52%, 23%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(210, 52%, 23%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={granularity === "diario" ? Math.max(Math.floor(chartData.length / 10), 1) : 0}
                  fontSize={11}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
                    return String(v);
                  }}
                  width={45}
                />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatBRL(Number(value))} />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="receitas"
                  stroke="var(--color-receitas)"
                  fill="url(#gradReceitas)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="despesas"
                  stroke="var(--color-despesas)"
                  fill="url(#gradDespesas)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="saldo"
                  stroke="var(--color-saldo)"
                  fill="url(#gradSaldo)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
