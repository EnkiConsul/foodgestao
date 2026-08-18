import { useMemo } from "react";
import { ChevronLeft, ChevronRight, ChevronRight as ArrowIcon, Lock } from "lucide-react";
import {
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ymd, type OccupantType } from "@/lib/dp/folga-rules";

export type MobileOccupant = {
  key: string;
  colaboradorId: string;
  colaboradorNome: string;
  type: OccupantType;
  origin: string;
  extra?: boolean;
};

type Props = {
  year: number;
  month0: number;
  occupantsByDate: Map<string, MobileOccupant[]>;
  manualBlocked: Map<string, { reason: string; liberada?: boolean }>;
  myColaboradorId?: string | null;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (iso: string) => void;
  /** Rótulo do contador exibido à direita do header (ex: "8 dias úteis"). Se omitido, mostra total do mês. */
  counterLabel?: string;
};

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CHIP_STYLE: Record<OccupantType, string> = {
  monthly: "bg-primary/15 text-primary border-primary/25",
  fixed: "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300",
  pending: "bg-violet-500/10 text-violet-700 border-violet-200 dark:text-violet-300",
};

/**
 * Variante mobile em lista vertical para os calendários do DP (admin e portal).
 * Mostra uma linha por dia do mês com chips coloridos para folgas, pendências
 * e bloqueios — inspirada no calendário do Portal do Colaborador.
 */
export function CalendarioMobileLista({
  year,
  month0,
  occupantsByDate,
  manualBlocked,
  myColaboradorId,
  onPrev,
  onNext,
  onSelectDay,
  counterLabel,
}: Props) {
  const today = new Date();

  const days = useMemo(() => {
    const start = startOfMonth(new Date(year, month0, 1));
    const end = endOfMonth(start);
    return eachDayOfInterval({ start, end });
  }, [year, month0]);

  const totalEventos = useMemo(() => {
    let n = 0;
    for (const d of days) {
      const iso = ymd(d);
      n += (occupantsByDate.get(iso)?.length ?? 0);
      if (manualBlocked.has(iso)) n += 1;
    }
    return n;
  }, [days, occupantsByDate, manualBlocked]);

  const monthLabel = format(new Date(year, month0, 1), "MMMM yyyy", { locale: ptBR });
  const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="rounded-2xl border bg-card overflow-hidden">
      {/* Header do mês */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-muted/40">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onPrev}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold tracking-tight truncate">
            {monthLabelCapitalized}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={onNext}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-3 py-1.5 flex items-center justify-between border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span>{days.length} dias</span>
        <span>{counterLabel ?? `${totalEventos} eventos`}</span>
      </div>

      {/* Lista de dias */}
      <ul className="divide-y">
        {days.map((d) => {
          const iso = ymd(d);
          const occupants = occupantsByDate.get(iso) ?? [];
          const block = manualBlocked.get(iso);
          const blocked = block && !block.liberada;
          const isToday = isSameDay(d, today);
          const hasEvents = occupants.length > 0 || blocked;
          const wd = WEEKDAY_SHORT[d.getDay()];
          const dayNum = d.getDate();

          return (
            <li key={iso}>
              <button
                type="button"
                onClick={() => onSelectDay(iso)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  "active:bg-muted/60 hover:bg-muted/40",
                  isToday && "bg-primary/5",
                )}
              >
                <div className="grid w-16 shrink-0 grid-cols-[2.25rem_1.75rem] items-center gap-1">
                  <span
                    className={cn(
                      "text-left text-[11px] font-semibold uppercase tracking-wide leading-none",
                      hasEvents ? "text-muted-foreground" : "text-muted-foreground/60",
                    )}
                  >
                    {wd}
                  </span>
                  <span
                    className={cn(
                      "text-right text-lg font-bold tabular-nums leading-none",
                      isToday && "text-primary",
                      !hasEvents && "text-muted-foreground/50",
                    )}
                  >
                    {dayNum}
                  </span>
                </div>

                <div className="flex-1 min-w-0 flex flex-wrap gap-1">
                  {blocked && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive max-w-full">
                      <Lock className="h-3 w-3 shrink-0" />
                      <span className="truncate">{block!.reason || "Bloqueado"}</span>
                    </span>
                  )}
                  {occupants.map((o) => {
                    const isMe = myColaboradorId && o.colaboradorId === myColaboradorId;
                    return (
                      <span
                        key={o.key}
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium max-w-full",
                          CHIP_STYLE[o.type],
                          isMe && "ring-1 ring-primary/50",
                        )}
                        title={`${o.colaboradorNome} — ${o.origin}`}
                      >
                        <span className="truncate">
                          {isMe ? "Minha folga" : o.colaboradorNome}
                          {o.extra ? " · Extra" : ""}
                        </span>
                      </span>
                    );
                  })}
                </div>

                <ArrowIcon className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
