import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Wallet, CalendarDays, CalendarIcon } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfYear,
  addMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  endOfWeek,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { amountColorClass } from "@/lib/transaction-sign";

type Granularity = "diario" | "semanal" | "mensal";
type PeriodPreset = "2months" | "3months" | "6months" | "12months" | "custom";

function getPeriodRange(preset: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  const from = startOfMonth(now);
  switch (preset) {
    case "2months":
      return { from, to: endOfMonth(addMonths(now, 1)) };
    case "3months":
      return { from, to: endOfMonth(addMonths(now, 2)) };
    case "6months":
      return { from, to: endOfMonth(addMonths(now, 5)) };
    case "12months":
    default:
      return { from, to: endOfMonth(addMonths(now, 11)) };
  }
}

const chartConfig: ChartConfig = {
  receitasReal: { label: "Receitas (Realizado)", color: "hsl(145, 50%, 42%)" },
  receitasProj: { label: "Receitas (Projetado)", color: "hsl(145, 40%, 62%)" },
  despesasReal: { label: "Despesas (Realizado)", color: "hsl(4, 78%, 57%)" },
  despesasProj: { label: "Despesas (Projetado)", color: "hsl(4, 60%, 75%)" },
  saldo: { label: "Saldo Acumulado", color: "hsl(210, 52%, 23%)" },
};

export default function FluxoCaixa() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();
  const formatBRL = maskBRL;
  const [granularity, setGranularity] = useState<Granularity>("diario");
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("2months");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(getPeriodRange("2months"));

  const activeRange = periodPreset === "custom" ? customRange : getPeriodRange(periodPreset);

  // Sincronização em tempo real
  useRealtimeSync({
    tables: ["transactions", "accounts"],
    invalidateKeyPrefixes: ["fluxo-caixa-"],
  });

  // Fetch all transactions (realized + projected via due_date)
  const { data: transactions = [] } = useQuery({
    queryKey: ["fluxo-caixa-transactions", user?.id, contextType, selectedCompanyId, periodPreset, customRange.from.toISOString(), customRange.to.toISOString()],
    enabled: !!user && isFinancialScopeReady(contextType, user?.id, selectedCompanyId),
    queryFn: async () => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      const startDate = format(activeRange.from, "yyyy-MM-dd");
      const endDate = format(activeRange.to, "yyyy-MM-dd");
      const q = applyFinancialScope(
        supabase
          .from("transactions")
          .select("amount, amount_paid, transaction_type, transaction_date, status, due_date, bill_status"),
        scope,
      )
        .neq("status", "cancelado")
        .or(`and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(due_date.gte.${startDate},due_date.lte.${endDate})`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Fetch current total balance
  const { data: accounts = [] } = useQuery({
    queryKey: ["fluxo-caixa-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []).map((a: any) => ({ current_balance: a.current_balance }));
    },
  });

  const currentBalance = useMemo(
    () => accounts.reduce((s, a) => s + Number(a.current_balance), 0),
    [accounts]
  );

  const chartData = useMemo(() => {
    const start = activeRange.from;
    const end = activeRange.to;
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const dailyMap: Record<string, { receitas: number; despesas: number; receitasProj: number; despesasProj: number }> = {};

    for (const t of transactions) {
      const effType: "entrada" | "saida" | null =
        t.transaction_type === "entrada" || t.transaction_type === "saida"
          ? t.transaction_type
          : null;
      if (effType === null) continue;

      if (t.due_date && t.bill_status !== "pago") {
        // Pending bills: use due_date, remaining amount — these are projections
        const remaining = Number(t.amount) - Number(t.amount_paid);
        if (remaining <= 0) continue;
        const key = t.due_date;
        if (!dailyMap[key]) dailyMap[key] = { receitas: 0, despesas: 0, receitasProj: 0, despesasProj: 0 };
        if (effType === "entrada") {
          dailyMap[key].receitas += remaining;
          if (key > todayStr) dailyMap[key].receitasProj += remaining;
        } else {
          dailyMap[key].despesas += remaining;
          if (key > todayStr) dailyMap[key].despesasProj += remaining;
        }
      } else {
        // Realized transactions
        const key = t.transaction_date;
        if (!dailyMap[key]) dailyMap[key] = { receitas: 0, despesas: 0, receitasProj: 0, despesasProj: 0 };
        if (effType === "entrada") {
          dailyMap[key].receitas += Number(t.amount);
          if (key > todayStr) dailyMap[key].receitasProj += Number(t.amount);
        } else {
          dailyMap[key].despesas += Number(t.amount);
          if (key > todayStr) dailyMap[key].despesasProj += Number(t.amount);
        }
      }
    }

    // Running balance starts at currentBalance and only adds FUTURE transactions
    if (granularity === "diario") {
      const days = eachDayOfInterval({ start, end });
      let runningBalance = currentBalance;
      return days.map((day) => {
        const key = format(day, "yyyy-MM-dd");
        const d = dailyMap[key] || { receitas: 0, despesas: 0, receitasProj: 0, despesasProj: 0 };
        const isFuture = key > todayStr;
        runningBalance += d.receitasProj - d.despesasProj;
        return {
          label: format(day, "dd/MM"),
          receitasReal: isFuture ? 0 : d.receitas,
          receitasProj: isFuture ? d.receitas : 0,
          despesasReal: isFuture ? 0 : d.despesas,
          despesasProj: isFuture ? d.despesas : 0,
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
        let recProj = 0;
        let desProj = 0;
        let isFuture = false;
        Object.entries(dailyMap).forEach(([dateStr, val]) => {
          const d = parseISO(dateStr);
          if (d >= weekStart && d <= wEnd) {
            receitas += val.receitas;
            despesas += val.despesas;
            recProj += val.receitasProj;
            desProj += val.despesasProj;
            if (dateStr > todayStr) isFuture = true;
          }
        });
        // If week is entirely in the future
        const weekIsFuture = format(weekStart, "yyyy-MM-dd") > todayStr;
        runningBalance += recProj - desProj;
        return {
          label: `${format(weekStart, "dd/MM")} - ${format(wEnd, "dd/MM")}`,
          receitasReal: weekIsFuture ? 0 : receitas,
          receitasProj: weekIsFuture ? receitas : 0,
          despesasReal: weekIsFuture ? 0 : despesas,
          despesasProj: weekIsFuture ? despesas : 0,
          saldo: runningBalance,
        };
      });
    }

    // mensal
    const months = eachMonthOfInterval({ start, end });
    let runningBalance = currentBalance;
    return months.map((m: Date) => {
      const mStart = startOfMonth(m);
      const mEnd = endOfMonth(m);
      let receitas = 0;
      let despesas = 0;
      let recProj = 0;
      let desProj = 0;
      Object.entries(dailyMap).forEach(([dateStr, val]) => {
        const d = parseISO(dateStr);
        if (d >= mStart && d <= mEnd) {
          receitas += val.receitas;
          despesas += val.despesas;
          recProj += val.receitasProj;
          desProj += val.despesasProj;
        }
      });
      const monthIsFuture = format(mStart, "yyyy-MM-dd") > todayStr;
      runningBalance += recProj - desProj;
      return {
        label: format(m, "MMM yyyy", { locale: ptBR }),
        receitasReal: monthIsFuture ? 0 : receitas,
        receitasProj: monthIsFuture ? receitas : 0,
        despesasReal: monthIsFuture ? 0 : despesas,
        despesasProj: monthIsFuture ? despesas : 0,
        saldo: runningBalance,
      };
    });
  }, [transactions, granularity, currentBalance, activeRange]);

  const todayLabel = useMemo(() => {
    const today = format(new Date(), "dd/MM");
    const found = chartData.find((d) => d.label === today || d.label.startsWith(today));
    return found?.label ?? null;
  }, [chartData]);

  const projectedTotals = useMemo(() => {
    const totalReceitas = chartData.reduce((s, d) => s + (d.receitasReal + d.receitasProj), 0);
    const totalDespesas = chartData.reduce((s, d) => s + (d.despesasReal + d.despesasProj), 0);
    const projectedBalance = chartData.length > 0 ? chartData[chartData.length - 1].saldo : currentBalance;
    return { totalReceitas, totalDespesas, projectedBalance };
  }, [chartData, currentBalance]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Fluxo de Caixa</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Acompanhe Entradas, Saídas e Projeções</p>
        </div>
        <Tabs value={granularity} onValueChange={(v) => setGranularity(v as Granularity)} className="w-full sm:w-auto">
          <TabsList className="w-full sm:w-auto overflow-x-auto">
            <TabsTrigger value="diario" className="flex-1 sm:flex-none">Diário</TabsTrigger>
            <TabsTrigger value="semanal" className="flex-1 sm:flex-none">Semanal</TabsTrigger>
            <TabsTrigger value="mensal" className="flex-1 sm:flex-none">Mensal</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          { key: "2months", label: "2 Meses" },
          { key: "3months", label: "3 Meses" },
          { key: "6months", label: "6 Meses" },
          { key: "12months", label: "12 Meses" },
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

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Saldo Atual</CardTitle>
            <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <div className="text-base md:text-xl font-bold">{formatBRL(currentBalance)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Entradas Previstas</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4 text-success" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <div className={`text-base md:text-xl font-bold ${amountColorClass(projectedTotals.totalReceitas)}`}>{formatBRL(projectedTotals.totalReceitas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Saídas Previstas</CardTitle>
            <TrendingDown className="h-3.5 w-3.5 md:h-4 md:w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <div className={`text-base md:text-xl font-bold ${amountColorClass(-projectedTotals.totalDespesas)}`}>{formatBRL(projectedTotals.totalDespesas)}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3 md:p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Saldo Projetado</CardTitle>
            <CalendarDays className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 md:p-4 pt-0">
            <div className={`text-base md:text-xl font-bold ${projectedTotals.projectedBalance >= 0 ? "text-success" : "text-destructive"}`}>
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
        <CardContent className="min-w-0 overflow-hidden px-2 md:px-6">
          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Nenhuma movimentação no período
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-72 w-full min-w-0 max-w-full">
              <AreaChart data={chartData} accessibilityLayer>
                <defs>
                  <linearGradient id="gradReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReceitasReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(145, 50%, 42%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradReceitasProj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(145, 40%, 62%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(145, 40%, 62%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDespesasReal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(4, 78%, 57%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(4, 78%, 57%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradDespesasProj" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(4, 60%, 75%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(4, 60%, 75%)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(210, 52%, 23%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(210, 52%, 23%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                {todayLabel && (
                  <ReferenceLine
                    x={todayLabel}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    label={{ value: "Hoje", position: "top", fill: "hsl(var(--primary))", fontSize: 11, fontWeight: 600 }}
                  />
                )}
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
                  dataKey="receitasReal"
                  stroke="var(--color-receitasReal)"
                  fill="url(#gradReceitasReal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="receitasProj"
                  stroke="var(--color-receitasProj)"
                  fill="url(#gradReceitasProj)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                />
                <Area
                  type="monotone"
                  dataKey="despesasReal"
                  stroke="var(--color-despesasReal)"
                  fill="url(#gradDespesasReal)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="despesasProj"
                  stroke="var(--color-despesasProj)"
                  fill="url(#gradDespesasProj)"
                  strokeWidth={2}
                  strokeDasharray="5 5"
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
