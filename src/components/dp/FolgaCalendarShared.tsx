import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Lock, LockOpen, AlertCircle, CheckCircle2, Cake, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MONTH_NAMES,
  WEEKDAY_LABELS,
  calculateDateStatus,
  getMonthDays,
  ymd,
  type ColaboradorRecord,
  type DateStatusKind,
  type DayOccupant,
  type FolgaRecord,
} from "@/lib/dp/folga-rules";

export interface FolgaCalendarSharedProps {
  year: number;
  month0: number;
  occupantsByDate: Map<string, DayOccupant[]>;
  manualBlocked: Map<string, { reason: string; liberada: boolean }>;
  dayLimits: Map<string, number>;
  birthdayByDate?: Map<string, { colaboradorId: string; status?: string }>;
  myColaboradorId: string | null;
  allFolgas: FolgaRecord[];
  allColaboradores: ColaboradorRecord[];
  pendingRequests: { data: string; colaborador_id?: string }[];
  isAdmin?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay?: (iso: string, info?: { status: DateStatusKind; reason?: string }) => void;
  locked?: { unlockDateBR: string } | null;
  variant?: "chunky" | "compact";
}

type Cell =
  | { kind: "blank" }
  | {
      kind: "day";
      date: Date;
      iso: string;
      status: DateStatusKind;
      occupants: DayOccupant[];
      limit: number;
      occupancy: number;
      label?: string;
      tooltip?: string;
      birthday?: { colaboradorId: string; status?: string };
    };

const statusStyles: Record<DateStatusKind, string> = {
  available: "bg-emerald-500/5 border-emerald-500/30 hover:bg-emerald-500/10",
  blocked: "bg-destructive/15 border-destructive/40",
  taken: "bg-destructive/10 border-destructive/30",
  birthday: "bg-destructive/10 border-destructive/30",
  mine: "bg-amber-500/15 border-amber-500/40",
  fixed: "bg-blue-500/10 border-blue-500/30",
  pending: "bg-violet-500/15 border-violet-500/50",
  past: "bg-muted/40 text-muted-foreground",
  weekday: "bg-card hover:bg-muted/40",
  swapped: "bg-amber-500/15 border-amber-500/40",
};

const tagColors: Record<DayOccupant["type"], string> = {
  fixed: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  monthly: "bg-primary/15 text-primary border-primary/30",
  pending: "bg-violet-500/90 text-white border-violet-600",
};

export function FolgaCalendarShared(props: FolgaCalendarSharedProps) {
  const {
    year,
    month0,
    occupantsByDate,
    manualBlocked,
    dayLimits,
    birthdayByDate = new Map(),
    myColaboradorId,
    allFolgas,
    allColaboradores,
    pendingRequests,
    isAdmin = false,
    onPrev,
    onNext,
    onSelectDay,
    locked,
    variant = "chunky",
  } = props;

  const isMobile = useIsMobile();

  const cells = useMemo<Cell[]>(() => {
    const first = new Date(year, month0, 1);
    const lead = first.getDay();
    const days = getMonthDays(year, month0);
    const result: Cell[] = [];
    for (let i = 0; i < lead; i++) result.push({ kind: "blank" });
    for (const d of days) {
      const iso = ymd(d);
      const info = calculateDateStatus({
        date: d,
        myColaboradorId,
        allFolgas,
        allColaboradores,
        manualBlocked,
        dayLimits,
        birthdayByDate,
        pendingRequests,
        isAdmin,
        locked,
      });
      result.push({
        kind: "day",
        date: d,
        iso,
        status: info.status,
        occupants: occupantsByDate.get(iso) ?? [],
        limit: info.limit ?? 1,
        occupancy: info.occupancy ?? 0,
        label: info.label,
        tooltip: info.reason,
        birthday: birthdayByDate.get(iso),
      });
    }
    return result;
  }, [
    year,
    month0,
    occupantsByDate,
    manualBlocked,
    dayLimits,
    birthdayByDate,
    myColaboradorId,
    allFolgas,
    allColaboradores,
    pendingRequests,
    isAdmin,
    locked,
  ]);

  const chunky = variant === "chunky";
  const containerCls = chunky
    ? "rounded-3xl border bg-card p-4 md:p-8 shadow-sm"
    : "rounded-2xl border bg-card p-3 md:p-5";

  const header = (
    <div className={cn("flex items-center justify-between", chunky ? "mb-6" : "mb-4")}>
      <h2 className={cn("font-bold tracking-tight", chunky ? "text-2xl md:text-3xl" : "text-lg")}>
        {MONTH_NAMES[month0]}{" "}
        <span className="font-medium text-muted-foreground">{year}</span>
      </h2>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onPrev}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="rounded-full" onClick={onNext}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );

  // ---- Mobile list ----
  if (isMobile) {
    return (
      <div className={containerCls}>
        {header}
        <div className="divide-y divide-border overflow-hidden rounded-2xl border">
          {cells.map((c, i) => {
            if (c.kind === "blank") return null;
            const hasMine = c.occupants.some((o) => o.colaboradorId === myColaboradorId);
            const wknd = c.date.getDay() === 0 || c.date.getDay() === 6;
            const past = c.status === "past";
            const dow = WEEKDAY_LABELS[c.date.getDay()];
            return (
              <button
                key={c.iso}
                type="button"
                onClick={() => onSelectDay?.(c.iso, { status: c.status, reason: c.tooltip })}
                className={cn(
                  "flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/40",
                  past && "opacity-70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 text-xs font-medium text-muted-foreground">{dow}</span>
                    <span className={cn("text-sm font-bold", !wknd && "text-muted-foreground", past && "opacity-50")}>
                      {c.date.getDate()}
                    </span>
                    {isAdmin && wknd && c.status !== "blocked" && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 px-1.5 py-0 text-[9px] font-black uppercase",
                          c.occupancy >= c.limit
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                        )}
                      >
                        {c.occupancy}/{c.limit}
                      </Badge>
                    )}
                    {!isAdmin && c.status === "available" && wknd && (
                      <Badge variant="outline" className="h-5 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-600">
                        Disponível
                      </Badge>
                    )}
                    {c.status === "blocked" && (
                      <Badge variant="outline" className="h-5 border-destructive/30 bg-destructive/10 px-1.5 py-0 text-[9px] text-destructive">
                        Bloqueado
                      </Badge>
                    )}

                    {c.status === "fixed" && !isAdmin && (
                      <Badge variant="outline" className="h-5 border-blue-500/30 bg-blue-500/10 px-1.5 py-0 text-[9px] text-blue-600">
                        Semanal
                      </Badge>
                    )}
                    {hasMine && !isAdmin && (
                      <Badge variant="outline" className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] text-amber-700">
                        Minha Folga
                      </Badge>
                    )}
                  </div>
                  {c.occupants.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.occupants.map((o) => (
                        <span
                          key={o.key}
                          className={cn(
                            "max-w-[140px] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium",
                            tagColors[o.type],
                          )}
                          title={o.colaboradorNome}
                        >
                          {o.colaboradorNome.split(" ")[0]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
        <Legend />
      </div>
    );
  }

  // ---- Desktop grid ----
  return (
    <div className={containerCls}>
      {header}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-2xl border bg-border">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="bg-muted/60 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (c.kind === "blank") return <div key={i} className="aspect-square bg-muted/20" />;
          const clickable = !!onSelectDay;
          const hasMine = c.occupants.some((o) => o.colaboradorId === myColaboradorId);
          const wknd = c.date.getDay() === 0 || c.date.getDay() === 6;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDay?.(c.iso, { status: c.status, reason: c.tooltip })}
              className={cn(
                "group relative flex min-h-[100px] flex-col border p-2 text-left transition-all md:min-h-[130px]",
                statusStyles[c.status],
                clickable && "cursor-pointer hover:shadow-md hover:z-10",
              )}
            >
              <div className="mb-2 flex items-start justify-between">
                <div className="flex flex-col gap-1">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      c.status === "available" && "text-emerald-600 dark:text-emerald-400",
                      c.status === "past" && "opacity-40",
                      c.status === "pending" && "text-violet-700 dark:text-violet-300",
                      (c.status === "mine" || c.status === "swapped") && "text-amber-700 dark:text-amber-300",
                    )}
                  >
                    {c.date.getDate()}
                  </span>
                  {isAdmin && wknd && (
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[9px] font-black",
                        c.occupancy >= c.limit
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : c.occupancy >= c.limit * 0.7
                            ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                      )}
                    >
                      {c.occupancy}/{c.limit}
                    </span>
                  )}
                  {!isAdmin && c.status === "blocked" && (
                    <span className="rounded-md border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-[9px] font-black text-destructive">
                      Bloqueado
                    </span>
                  )}
                  {!isAdmin && c.status === "available" && wknd && (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black text-emerald-600">
                      Disponível
                    </span>
                  )}
                  {!isAdmin && c.status === "fixed" && (
                    <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black text-blue-600">
                      Semanal
                    </span>
                  )}
                  {!isAdmin && hasMine && (
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-black text-amber-700">
                      Minha Folga
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  {c.status === "available" && !isAdmin && <LockOpen className="h-3.5 w-3.5 text-emerald-500" />}
                  {(c.status === "mine" || c.status === "swapped" || hasMine) && (
                    <CheckCircle2 className="h-4 w-4 text-amber-600" />
                  )}
                  {c.status === "pending" && <AlertCircle className="h-4 w-4 text-violet-600" />}
                  {c.status === "blocked" && <Lock className="h-3.5 w-3.5 text-destructive" />}
                  {c.birthday && <Cake className="h-3.5 w-3.5 text-amber-500" />}
                </div>
              </div>

              {c.occupants.length > 0 && (
                <div className="flex flex-col gap-1 overflow-hidden">
                  {c.occupants.slice(0, 4).map((o) => (
                    <span
                      key={o.key}
                      className={cn(
                        "w-fit max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm",
                        tagColors[o.type],
                      )}
                      title={`${o.colaboradorNome} · ${o.origin}`}
                    >
                      {o.colaboradorNome.split(" ")[0]}
                    </span>
                  ))}
                  {c.occupants.length > 4 && (
                    <span className="ml-1 flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                      <Users className="h-3 w-3" /> +{c.occupants.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-6 flex flex-wrap gap-6 border-t pt-5">
      <LegendItem color="bg-emerald-500" label="Disponível" />
      <LegendItem color="bg-blue-500" label="Folga Semanal" />
      <LegendItem color="bg-primary" label="Folga Mensal" />
      <LegendItem color="bg-violet-500" label="Pendente" />
      <LegendItem color="bg-destructive" label="Bloqueado" />
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", color)} />
      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}
