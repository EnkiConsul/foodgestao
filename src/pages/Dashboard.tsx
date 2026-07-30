import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Wallet, Target, Landmark, CalendarIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { usePrivacy } from "@/hooks/usePrivacy";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { applyFinancialScope, assertFinancialScope, isFinancialScopeReady } from "@/lib/financialScope";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line } from "recharts";
import { BankLogo } from "@/components/accounts/BankLogo";
import { UpcomingCardInvoicesWidget } from "@/components/dashboard/UpcomingCardInvoicesWidget";
import { CashFlowProjectionWidget } from "@/components/dashboard/CashFlowProjectionWidget";


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

type PeriodPreset = "month" | "3months" | "6months" | "year" | "custom";
type PaymentStatusFilter = "todos" | "confirmado" | "pendente";

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

export default function Dashboard() {
  const { user } = useAuth();
  const { contextType, selectedCompanyId } = useCompanyContext();
  const { maskBRL } = usePrivacy();

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("month");
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date }>(getPeriodRange("month"));
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatusFilter>("todos");

  const activeRange = periodPreset === "custom" ? customRange : getPeriodRange(periodPreset);

  // Sincronização em tempo real (PJ colaborativo / PF próprio)
  useRealtimeSync({
    tables: ["transactions", "accounts", "categories"],
    invalidateKeyPrefixes: ["dashboard-"],
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ["dashboard-transactions", user?.id, contextType, selectedCompanyId, periodPreset, customRange.from.toISOString(), customRange.to.toISOString(), paymentStatus],
    enabled: !!user && isFinancialScopeReady(contextType, user?.id, selectedCompanyId),
    queryFn: async () => {
      const scope = assertFinancialScope({ context: contextType, userId: user!.id, companyId: selectedCompanyId });
      const startDate = activeRange.from.toISOString().split("T")[0];
      const endDate = activeRange.to.toISOString().split("T")[0];
      let q = applyFinancialScope(
        supabase
          .from("transactions")
          .select("amount, amount_paid, transaction_type, transaction_date, category_id, status, due_date"),
        scope,
      )
        // Mesmo critério de Lançamentos: quando existe vencimento, o período é o do due_date.
        .or(
          `and(due_date.is.null,transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(due_date.gte.${startDate},due_date.lte.${endDate})`,
        )
        .neq("status", "cancelado");

      if (paymentStatus !== "todos") q = q.eq("status", paymentStatus);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["dashboard-categories", user?.id, contextType, selectedCompanyId],
    enabled: !!user && (contextType === "pf" || !!selectedCompanyId),
    queryFn: async () => {
      const { data } = await supabase.rpc("get_accessible_categories", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, color: c.color }));
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["dashboard-accounts", user?.id, contextType, selectedCompanyId],
    enabled: !!user,
    queryFn: async () => {
      if (contextType === "pj" && !selectedCompanyId) return [];
      const { data } = await supabase.rpc("get_accessible_accounts", {
        _context: contextType,
        _company_id: contextType === "pj" ? selectedCompanyId! : undefined,
      });
      return (data ?? []).map((a: any) => ({
        name: a.name, current_balance: a.current_balance, color: a.color, is_active: a.is_active, bank_slug: a.bank_slug,
      }));
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

  const { monthlyData, balanceEvolution, dailyEvolution, topCategories, totalReceitas, totalDespesas } = useMemo(() => {
    const months: Record<string, { receitas: number; despesas: number }> = {};
    const confirmedMonths: Record<string, { receitas: number; despesas: number }> = {};
    const days: Record<string, { receitas: number; despesas: number }> = {};
    const catTotals: Record<string, number> = {};
    let totalR = 0;
    let totalD = 0;

    const isEffective = (t: typeof transactions[0]) =>
      t.status === "confirmado" || (t.due_date && Number(t.amount_paid) >= Number(t.amount));

    for (const t of transactions) {
      const refDate = t.due_date ?? t.transaction_date;
      const month = refDate.slice(0, 7); // YYYY-MM
      const day = refDate.slice(0, 10); // YYYY-MM-DD

      if (!months[month]) months[month] = { receitas: 0, despesas: 0 };
      if (!confirmedMonths[month]) confirmedMonths[month] = { receitas: 0, despesas: 0 };
      if (!days[day]) days[day] = { receitas: 0, despesas: 0 };

      const effType: "entrada" | "saida" | null =
        t.transaction_type === "entrada" || t.transaction_type === "saida"
          ? t.transaction_type
          : null;

      if (effType === "entrada") {
        months[month].receitas += Number(t.amount);
        days[day].receitas += Number(t.amount);
        totalR += Number(t.amount);
        if (isEffective(t)) confirmedMonths[month].receitas += Number(t.amount);
      } else if (effType === "saida") {
        months[month].despesas += Number(t.amount);
        days[day].despesas += Number(t.amount);
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
      const [year, monthNum] = key.split("-");
      return {
        month: `${monthNames[parseInt(monthNum) - 1]}/${year.slice(2)}`,
        saldo: cumulative,
      };
    });

    const dailyEvo = Object.keys(days).sort().map((key) => {
      const [, m, d] = key.split("-");
      return {
        day: `${d}/${m}`,
        receitas: days[key].receitas,
        despesas: days[key].despesas,
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

    return { monthlyData: sorted, balanceEvolution: balEvo, dailyEvolution: dailyEvo, topCategories: top5, totalReceitas: totalR, totalDespesas: totalD };
  }, [transactions, catMap]);

  const saldo = totalReceitas - totalDespesas;
  const changeR = totalReceitas > 0 ? `+${((totalReceitas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";
  const changeD = totalDespesas > 0 ? `-${((totalDespesas / (totalReceitas + totalDespesas || 1)) * 100).toFixed(0)}%` : "0%";

  const kpis = [
    {
      label: "Saldo",
      value: maskBRL(saldo),
      hint: totalReceitas > 0 ? `${((saldo / totalReceitas) * 100).toFixed(0)}% das Receitas` : "Do período",
      icon: Wallet,
      positive: saldo >= 0,
      variant: "plain" as const,
    },
    {
      label: "Contas Bancárias",
      value: maskBRL(totalBankBalance),
      hint: `${accounts.length} ${accounts.length === 1 ? "conta ativa" : "contas ativas"}`,
      icon: Landmark,
      positive: totalBankBalance >= 0,
      variant: "hero" as const,
    },
    {
      label: "Receitas",
      value: maskBRL(totalReceitas),
      hint: totalReceitas + totalDespesas > 0 ? `${((totalReceitas / (totalReceitas + totalDespesas)) * 100).toFixed(0)}% do fluxo` : "Do período",
      icon: TrendingUp,
      positive: true,
      variant: "accent-success" as const,
      progress: totalReceitas + totalDespesas > 0 ? (totalReceitas / (totalReceitas + totalDespesas)) * 100 : 0,
    },
    {
      label: "Despesas",
      value: maskBRL(totalDespesas),
      hint: totalReceitas > 0 ? `${((totalDespesas / totalReceitas) * 100).toFixed(0)}% das Receitas` : "Do período",
      icon: TrendingDown,
      positive: false,
      variant: "accent-primary" as const,
      progress: totalReceitas + totalDespesas > 0 ? (totalDespesas / (totalReceitas + totalDespesas)) * 100 : 0,
    },
  ];

  const barConfig: ChartConfig = {
    receitas: { label: "Receitas", color: "hsl(160 65% 38%)" },
    despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
  };

  const donutConfig: ChartConfig = Object.fromEntries(
    topCategories.map((c) => [c.name, { label: c.name, color: c.fill }])
  );

  const totalCategoryValue = topCategories.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão Geral das Suas Finanças</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-full border border-border/60">
          {([
            { key: "month", label: "Mês" },
            { key: "3months", label: "3M" },
            { key: "6months", label: "6M" },
            { key: "year", label: "Ano" },
          ] as { key: PeriodPreset; label: string }[]).map((p) => (
            <Button
              key={p.key}
              variant="ghost"
              size="sm"
              onClick={() => setPeriodPreset(p.key)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium transition-all",
                periodPreset === p.key
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              )}
            >
              {p.label}
            </Button>
          ))}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-medium gap-1.5 transition-all",
                  periodPreset === "custom"
                    ? "bg-background text-foreground shadow-sm hover:bg-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                )}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                {periodPreset === "custom"
                  ? `${format(customRange.from, "dd/MM/yy")} – ${format(customRange.to, "dd/MM/yy")}`
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

        {/* Filtro Status Pagamento */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/50 rounded-full border border-border/60">
          {([
            { key: "todos", label: "Todos" },
            { key: "confirmado", label: "Pago" },
            { key: "pendente", label: "Pendente" },
          ] as { key: PaymentStatusFilter; label: string }[]).map((s) => (
            <Button
              key={s.key}
              variant="ghost"
              size="sm"
              onClick={() => setPaymentStatus(s.key)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-medium transition-all capitalize",
                paymentStatus === s.key
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              )}
            >
              {s.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-2.5 md:gap-4 lg:gap-5">
        {/* KPIs */}
        {kpis.map((kpi) => {
          const isHero = kpi.variant === "hero";
          return (
            <div
              key={kpi.label}
              className={cn(
                "col-span-6 lg:col-span-3 p-3.5 md:p-5 rounded-xl md:rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between min-h-[96px] md:min-h-[130px]",
                isHero
                  ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20"
                  : "bg-card border-border/60 shadow-sm hover:shadow-md"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-[11px] font-medium uppercase tracking-wider",
                  isHero ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {kpi.label}
                </span>
                <kpi.icon className={cn(
                  "h-4 w-4",
                  isHero ? "text-primary-foreground/70" : (kpi.positive ? "text-success" : "text-muted-foreground")
                )} />
              </div>
              <div className="mt-1.5 md:mt-2">
                <div className={cn(
                  "font-display font-bold tracking-tight text-lg sm:text-2xl leading-tight whitespace-nowrap",
                  isHero
                    ? "text-primary-foreground"
                    : kpi.variant === "accent-success"
                      ? "text-success"
                      : "text-foreground"
                )}>
                  {kpi.value}
                </div>
                {kpi.variant === "accent-success" || kpi.variant === "accent-primary" ? (
                  <div className={cn("h-1 w-full rounded-full mt-2.5 overflow-hidden", "bg-muted")}>
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        kpi.variant === "accent-success" ? "bg-success" : "bg-destructive"
                      )}
                      style={{ width: `${Math.min(100, Math.max(0, kpi.progress ?? 0))}%` }}
                    />
                  </div>
                ) : (
                  <p className={cn(
                    "text-xs mt-1",
                    isHero ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}>
                    {kpi.hint}
                  </p>
                )}
              </div>
            </div>
          );
        })}

        {/* Receitas vs Despesas */}
        <div className="col-span-12 lg:col-span-8 p-6 rounded-3xl bg-card border border-border/60 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Receitas vs Despesas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Comparativo por mês</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs text-muted-foreground">Receitas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-xs text-muted-foreground">Despesas</span>
              </div>
            </div>
          </div>
          {monthlyData.length === 0 ? (
            <div className="flex items-center justify-center h-56 text-muted-foreground text-sm">
              Nenhuma transação registrada ainda
            </div>
          ) : (
            <ChartContainer config={barConfig} className="h-56 w-full">
              <BarChart data={monthlyData} accessibilityLayer>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
                <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ChartContainer>
          )}
        </div>

        {/* Top 5 Categorias */}
        <div className="col-span-12 lg:col-span-4 p-6 rounded-3xl bg-card border border-border/60 shadow-sm">
          <h2 className="font-display text-lg font-bold text-foreground mb-1">Top 5 Categorias</h2>
          <p className="text-xs text-muted-foreground mb-5">Distribuição de despesas</p>
          {topCategories.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Nenhuma despesa categorizada ainda
            </div>
          ) : (
            <div className="space-y-4">
              {topCategories.map((cat, i) => {
                const pct = totalCategoryValue > 0 ? (cat.value / totalCategoryValue) * 100 : 0;
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.fill }} />
                        <span className="text-foreground/80 truncate">{cat.name}</span>
                      </div>
                      <span className="font-semibold text-foreground shrink-0 ml-2">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cat.fill }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Evolução Diária */}
        <div className="col-span-12 lg:col-span-7 p-6 rounded-3xl bg-card border border-border/60 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-display text-lg font-bold text-foreground">Evolução Diária</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Receitas x Despesas no período</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="text-xs text-muted-foreground">Receitas</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-destructive" />
                <span className="text-xs text-muted-foreground">Despesas</span>
              </div>
            </div>
          </div>
          {dailyEvolution.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Sem movimentação diária no período
            </div>
          ) : (
            <ChartContainer config={barConfig} className="h-48 w-full">
              <LineChart data={dailyEvolution} accessibilityLayer margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
                <Line type="monotone" dataKey="receitas" stroke="var(--color-receitas)" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="despesas" stroke="var(--color-despesas)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ChartContainer>
          )}
        </div>

        {/* Saldo por Conta Bancária */}
        <div className="col-span-12 lg:col-span-5 p-6 rounded-3xl bg-card border border-border/60 shadow-sm">
          <h2 className="font-display text-lg font-bold text-foreground mb-1">Saldo por Conta</h2>
          <p className="text-xs text-muted-foreground mb-5">Posição atual das contas bancárias</p>
          {accounts.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Nenhuma conta cadastrada
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {accounts.map((acc, i) => {
                const balance = Number(acc.current_balance);
                return (
                  <div
                    key={i}
                    className="flex items-center p-3 rounded-xl bg-muted/40 border border-border/40 hover:border-primary/30 hover:bg-muted/60 transition-all"
                  >
                    <BankLogo
                      slug={(acc as { bank_slug?: string | null }).bank_slug}
                      fallbackName={acc.name}
                      size={32}
                      fallbackColor={acc.color || undefined}
                      className="shrink-0 rounded-lg"
                    />
                    <div className="flex-1 min-w-0 ml-3">
                      <p className="text-sm font-semibold text-foreground truncate">{acc.name}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conta bancária</p>
                    </div>
                    <span className={cn(
                      "font-display text-sm font-bold shrink-0 ml-2 tracking-tight",
                      balance >= 0 ? "text-foreground" : "text-destructive"
                    )}>
                      {maskBRL(balance)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Faturas a vencer (Cartões) */}
        <UpcomingCardInvoicesWidget className="col-span-12 lg:col-span-6" />

        {/* Projeção de Caixa configurável */}
        <CashFlowProjectionWidget className="col-span-12" />

        {/* Balance Evolution (kept, full-width) */}
        {balanceEvolution.length > 1 && (
          <div className="col-span-12 lg:col-span-6 p-6 rounded-3xl bg-card border border-border/60 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Evolução do Saldo</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Saldo acumulado mensal</p>
              </div>
            </div>
            <ChartContainer config={{ saldo: { label: "Saldo", color: "hsl(var(--primary))" } }} className="h-48 w-full">
              <AreaChart data={balanceEvolution} accessibilityLayer>
                <defs>
                  <linearGradient id="saldoGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/40" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} className="text-xs" />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => maskBRL(Number(value))} />} />
                <Area type="monotone" dataKey="saldo" stroke="hsl(var(--primary))" fill="url(#saldoGradient)" strokeWidth={2.5} />
              </AreaChart>
            </ChartContainer>
          </div>
        )}
      </div>
    </div>
  );
}
