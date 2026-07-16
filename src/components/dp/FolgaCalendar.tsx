import { useMemo } from "react";
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  startOfMonth, startOfWeek, subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type FolgaCell = {
  id: string;
  data: string; // YYYY-MM-DD
  colaborador_id: string;
  colaborador_nome?: string;
  status: string;
  tipo: string;
  extra: boolean;
  origem?: string;
};

type Props = {
  ano: number;
  mes: number; // 1-12
  folgas: FolgaCell[];
  datasBloqueadas?: Array<{ data: string; motivo: string }>;
  diaConfigLimite?: Record<string, number>;
  onChangeMonth?: (ano: number, mes: number) => void;
  onDayClick?: (data: string) => void;
  highlightColaboradorId?: string;
};

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function FolgaCalendar({
  ano, mes, folgas, datasBloqueadas = [], diaConfigLimite = {},
  onChangeMonth, onDayClick, highlightColaboradorId,
}: Props) {
  const monthStart = new Date(ano, mes - 1, 1);
  const gridStart = startOfWeek(startOfMonth(monthStart), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const folgasByDate = useMemo(() => {
    const m = new Map<string, FolgaCell[]>();
    for (const f of folgas) {
      if (f.status === "cancelada") continue;
      const arr = m.get(f.data) ?? [];
      arr.push(f);
      m.set(f.data, arr);
    }
    return m;
  }, [folgas]);

  const blockedByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of datasBloqueadas) m.set(b.data, b.motivo);
    return m;
  }, [datasBloqueadas]);

  const goto = (delta: number) => {
    if (!onChangeMonth) return;
    const d = delta > 0 ? addMonths(monthStart, 1) : subMonths(monthStart, 1);
    onChangeMonth(d.getFullYear(), d.getMonth() + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => goto(-1)} disabled={!onChangeMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold capitalize min-w-[10rem] text-center">
            {format(monthStart, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <Button variant="outline" size="icon" onClick={() => goto(1)} disabled={!onChangeMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block rounded-md border overflow-hidden">
        <div className="grid grid-cols-7 bg-muted/50 text-xs font-medium">
          {DOW.map((d) => (
            <div key={d} className="p-2 text-center border-b">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const inMonth = isSameMonth(d, monthStart);
            const fs = folgasByDate.get(iso) ?? [];
            const bloqueio = blockedByDate.get(iso);
            const limite = diaConfigLimite[iso];
            const isMine = highlightColaboradorId && fs.some((f) => f.colaborador_id === highlightColaboradorId);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onDayClick?.(iso)}
                className={cn(
                  "min-h-[7rem] p-2 border-b border-r text-left flex flex-col gap-1 transition-colors",
                  onDayClick && "hover:bg-accent/40 cursor-pointer",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                  bloqueio && "bg-destructive/5",
                  isMine && "ring-2 ring-primary ring-inset",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-sm font-medium", !inMonth && "opacity-50")}>
                    {format(d, "d")}
                  </span>
                  <div className="flex items-center gap-1">
                    {bloqueio && <Lock className="h-3 w-3 text-destructive" />}
                    {limite ? (
                      <Badge variant="outline" className="h-4 px-1 text-[10px]">
                        {fs.length}/{limite}
                      </Badge>
                    ) : fs.length > 0 ? (
                      <Badge variant="secondary" className="h-4 px-1 text-[10px]">{fs.length}</Badge>
                    ) : null}
                  </div>
                </div>
                {bloqueio && (
                  <span className="text-[10px] text-destructive truncate">{bloqueio}</span>
                )}
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {fs.slice(0, 4).map((f) => (
                    <span
                      key={f.id}
                      className={cn(
                        "text-[10px] truncate px-1 rounded",
                        f.extra ? "bg-accent text-accent-foreground" : "bg-primary/10 text-primary",
                        f.colaborador_id === highlightColaboradorId && "font-semibold",
                      )}
                      title={`${f.colaborador_nome ?? ""} — ${f.origem ?? ""}`}
                    >
                      {f.colaborador_nome ?? "—"}
                    </span>
                  ))}
                  {fs.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{fs.length - 4}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile list */}
      <div className="md:hidden space-y-2">
        {days.filter((d) => isSameMonth(d, monthStart)).map((d) => {
          const iso = format(d, "yyyy-MM-dd");
          const fs = folgasByDate.get(iso) ?? [];
          const bloqueio = blockedByDate.get(iso);
          const limite = diaConfigLimite[iso];
          if (fs.length === 0 && !bloqueio && !limite) return null;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick?.(iso)}
              className={cn(
                "w-full text-left rounded-md border p-3 space-y-1",
                bloqueio && "bg-destructive/5",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">
                  {format(d, "EEE, dd/MM", { locale: ptBR })}
                </span>
                {limite ? <Badge variant="outline">{fs.length}/{limite}</Badge> : null}
              </div>
              {bloqueio && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <Lock className="h-3 w-3" /> {bloqueio}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {fs.map((f) => (
                  <Badge key={f.id} variant={f.extra ? "default" : "secondary"} className="text-[10px]">
                    {f.colaborador_nome ?? "—"}{f.extra ? " (extra)" : ""}
                  </Badge>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
