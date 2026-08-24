import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getMonthDays, ymd } from "@/lib/dp/folga-rules";

/**
 * Calendário mensal genérico. NÃO conhece regras de Folgas, DSR ou férias:
 * quem usa decide o que cada dia significa. Assim Convocações e Folgas
 * evoluem sem se contaminarem.
 */
export interface MonthGridDay {
  /** Selo curto exibido abaixo do número (ex.: "2 vagas"). */
  selo?: string | null;
  /** Cor do selo/estado. */
  tom?: "neutro" | "primario" | "atencao" | "critico" | "sucesso";
  /** Impede a seleção do dia. */
  desabilitado?: boolean;
  /** Explicação no title do botão. */
  titulo?: string | null;
}

interface MonthGridCalendarProps {
  ano: number;
  /** Mês 1-12. */
  mes: number;
  onMesChange?: (ano: number, mes: number) => void;
  selecionados: Set<string>;
  onToggleDia: (iso: string) => void;
  info?: Record<string, MonthGridDay>;
  className?: string;
}

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const TONS: Record<NonNullable<MonthGridDay["tom"]>, string> = {
  neutro: "bg-muted text-muted-foreground",
  primario: "bg-primary/15 text-primary",
  atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  critico: "bg-destructive/15 text-destructive",
  sucesso: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export function MonthGridCalendar({
  ano,
  mes,
  onMesChange,
  selecionados,
  onToggleDia,
  info,
  className,
}: MonthGridCalendarProps) {
  const dias = useMemo(() => getMonthDays(ano, mes - 1), [ano, mes]);
  const offset = dias.length ? dias[0].getDay() : 0;

  const irPara = (delta: number) => {
    if (!onMesChange) return;
    const base = new Date(ano, mes - 1 + delta, 1);
    onMesChange(base.getFullYear(), base.getMonth() + 1);
  };

  const rotuloMes = new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => irPara(-1)}
          disabled={!onMesChange}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold capitalize">{rotuloMes}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => irPara(1)}
          disabled={!onMesChange}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase text-muted-foreground">
        {SEMANA.map((d, i) => (
          <div key={`${d}-${i}`}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`vazio-${i}`} />
        ))}
        {dias.map((d) => {
          const iso = ymd(d);
          const meta = info?.[iso];
          const ativo = selecionados.has(iso);
          return (
            <button
              key={iso}
              type="button"
              title={meta?.titulo ?? undefined}
              disabled={meta?.desabilitado}
              onClick={() => onToggleDia(iso)}
              className={cn(
                "flex min-h-[46px] flex-col items-center justify-center rounded-lg border p-1 text-xs transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-40",
                ativo
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <span className="tabular-nums">{d.getDate()}</span>
              {meta?.selo ? (
                <span
                  className={cn(
                    "mt-0.5 rounded px-1 text-[9px] leading-tight",
                    TONS[meta.tom ?? "neutro"],
                  )}
                >
                  {meta.selo}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
