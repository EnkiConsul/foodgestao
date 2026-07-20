import { useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Wallet, AlertTriangle, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/hooks/usePrivacy";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { useCashFlowProjection, type HorizonDays } from "@/hooks/useCashFlowProjection";
import { formatBRL } from "@/lib/billing";

const HORIZONS: { value: HorizonDays; label: string }[] = [
  { value: 7, label: "7 dias" },
  { value: 15, label: "15 dias" },
  { value: 30, label: "30 dias" },
  { value: 60, label: "60 dias" },
  { value: 90, label: "90 dias" },
];

const STORAGE_KEY = "dashboard-cashflow-horizon";

function loadHorizon(): HorizonDays {
  if (typeof window === "undefined") return 30;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = Number(raw);
  return (HORIZONS.some((h) => h.value === n) ? (n as HorizonDays) : 30);
}

const chartConfig: ChartConfig = {
  projectedBalance: { label: "Saldo projetado", color: "hsl(var(--primary))" },
};

export function CashFlowProjectionWidget({ className }: { className?: string }) {
  const [horizon, setHorizon] = useState<HorizonDays>(() => loadHorizon());
  const { maskBRL, privacyMode } = usePrivacy();
  const { points, totals, isLoading } = useCashFlowProjection(horizon);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(horizon));
    }
  }, [horizon]);

  const hasActivity = totals.totalInflow > 0 || totals.totalOutflow > 0 || totals.totalCardOutflow > 0;
  const lowestNegative = totals.lowestBalance < 0;
  const lowestLabel = totals.lowestDate
    ? (() => {
        const d = new Date(`${totals.lowestDate}T00:00:00`);
        return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      })()
    : "";

  return (
    <div className={cn("p-6 rounded-3xl bg-card border border-border/60 shadow-sm", className)}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Projeção de Caixa</h2>
            <p className="text-xs text-muted-foreground">
              Saldo atual + contas pendentes + faturas de cartão
            </p>
          </div>
        </div>
        <Select value={String(horizon)} onValueChange={(v) => setHorizon(Number(v) as HorizonDays)}>
          <SelectTrigger className="w-[130px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZONS.map((h) => (
              <SelectItem key={h.value} value={String(h.value)} className="text-xs">
                Próximos {h.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="Saldo atual"
          value={maskBRL(totals.startingBalance)}
          icon={<Wallet className="h-3.5 w-3.5" />}
          tone="neutral"
        />
        <Kpi
          label="Entradas previstas"
          value={maskBRL(totals.totalInflow)}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          tone="positive"
        />
        <Kpi
          label="Saídas previstas"
          value={maskBRL(totals.totalOutflow + totals.totalCardOutflow)}
          icon={<TrendingDown className="h-3.5 w-3.5" />}
          tone="negative"
          hint={
            totals.totalCardOutflow > 0
              ? `Cartão: ${maskBRL(totals.totalCardOutflow)}`
              : undefined
          }
        />
        <Kpi
          label="Saldo final"
          value={maskBRL(totals.endingBalance)}
          icon={totals.endingBalance >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          tone={totals.endingBalance >= 0 ? "positive" : "negative"}
        />
      </div>

      {lowestNegative && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-destructive">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-semibold">Alerta de saldo negativo</p>
            <p className="opacity-90">
              O saldo projetado pode chegar a {maskBRL(totals.lowestBalance)} em {lowestLabel}.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !hasActivity && points.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground">
          <Wallet className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">Sem movimentações previstas no período</p>
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={points} accessibilityLayer margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="cashflow-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              minTickGap={20}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              width={70}
              tickFormatter={(v) => (privacyMode ? "•••" : compactBRL(Number(v)))}
            />
            <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" strokeOpacity={0.6} />
            <ChartTooltip content={<CashFlowTooltip maskBRL={maskBRL} />} />
            <Area
              type="monotone"
              dataKey="projectedBalance"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#cashflow-fill)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "positive" | "negative" | "neutral";
  hint?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="p-3 rounded-2xl bg-muted/40 border border-border/40">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn("font-display text-lg font-bold tracking-tight leading-tight", toneClass)}>
        {value}
      </p>
      {hint && (
        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
          <CreditCard className="h-3 w-3" />
          {hint}
        </p>
      )}
    </div>
  );
}

function CashFlowTooltip({
  active,
  payload,
  label,
  maskBRL,
}: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload as {
    inflow: number;
    outflow: number;
    cardOutflow: number;
    projectedBalance: number;
  };
  return (
    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-md text-xs space-y-1">
      <p className="font-semibold text-foreground">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-emerald-600 dark:text-emerald-400">Entradas</span>
        <span>{maskBRL(p.inflow)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-destructive">Saídas</span>
        <span>{maskBRL(p.outflow)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-orange-600 dark:text-orange-400">Cartão</span>
        <span>{maskBRL(p.cardOutflow)}</span>
      </div>
      <div className="border-t border-border/60 pt-1 flex justify-between gap-4 font-semibold">
        <span>Saldo</span>
        <span>{maskBRL(p.projectedBalance)}</span>
      </div>
    </div>
  );
}

function compactBRL(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return formatBRL(v).replace("R$", "").trim();
}
