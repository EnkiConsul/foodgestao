import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Cabeçalho oficial compartilhado entre o calendário completo e o Início. */
export function CalendarioSemanaCabecalho({ diasDominicais = [0], compacto = false }: { diasDominicais?: number[]; compacto?: boolean }) {
  return <>{DIAS.map((dia, i) => <div key={dia} className={cn(
    "flex min-w-0 items-center justify-center gap-0.5 border-b-2 border-primary py-2.5 font-extrabold uppercase",
    compacto ? "text-[9px]" : "text-xs",
     diasDominicais.includes(i) ? "bg-primary text-primary-foreground" : "bg-calendar-header text-calendar-header-foreground",
  )}>
    {dia}{(i === 0 || i >= 5) && <Flame aria-label="Pico de operação" className={cn("shrink-0 fill-warning text-warning", compacto ? "h-2.5 w-2.5" : "h-3.5 w-3.5")} />}
  </div>)}</>;
}