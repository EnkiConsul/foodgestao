import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  mes: string; onMesChange: (mes: string) => void; hoje: string;
  disponiveis: string[]; selecionada: string; outraData: string;
  onSelecionar: (data: string) => void; disabled?: boolean; carregando?: boolean;
};

export function TrocaMiniCalendario({ mes, onMesChange, hoje, disponiveis, selecionada, outraData, onSelecionar, disabled, carregando }: Props) {
  const inicio = new Date(`${mes}-01T12:00:00`);
  const total = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
  const mudarMes = (delta: number) => {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + delta, 1, 12);
    onMesChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  return <section aria-label="Calendário de folgas" aria-busy={carregando} className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Mês anterior" disabled={disabled} onClick={() => mudarMes(-1)}><ChevronLeft className="h-5 w-5" /></Button>
      <span className="text-sm font-semibold capitalize">{inicio.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
      <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Próximo mês" disabled={disabled} onClick={() => mudarMes(1)}><ChevronRight className="h-5 w-5" /></Button>
    </div>
    <div className="grid grid-cols-7 gap-0.5 text-center">
      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => <span key={d} className="pb-2 text-xs text-muted-foreground">{d}</span>)}
      {Array.from({ length: inicio.getDay() }, (_, i) => <span key={`vazio-${i}`} />)}
      {Array.from({ length: total }, (_, i) => {
        const data = `${mes}-${String(i + 1).padStart(2, "0")}`;
        const livre = disponiveis.includes(data);
        const atual = data === selecionada;
        const envolvida = data === outraData;
        return <Button key={data} variant={atual ? "default" : livre ? "outline" : "ghost"}
          aria-label={`${new Date(`${data}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}${livre ? ", folga disponível" : ""}${envolvida ? ", outra data da troca" : ""}${data === hoje ? ", hoje" : ""}`}
          aria-pressed={atual} aria-current={data === hoje ? "date" : undefined}
          disabled={disabled || carregando || !livre} onClick={() => onSelecionar(data)}
          className={cn("relative h-11 w-full min-w-0 p-0 text-sm disabled:opacity-60", envolvida && !atual && "border-2 border-primary bg-primary/10 text-primary", !livre && !envolvida && "text-muted-foreground")}>
          {i + 1}{data === hoje && <span aria-hidden="true" className={cn("absolute bottom-1 h-1 w-1 rounded-full", atual ? "bg-primary-foreground" : "bg-primary")} />}
        </Button>;
      })}
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border border-input" />Folga disponível</span><span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded bg-primary" />Selecionada</span>{outraData && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-3 rounded border-2 border-primary bg-primary/10" />Data da outra pessoa</span>}<span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />Hoje</span></div>
    {carregando && <p role="status" className="text-sm text-muted-foreground">Carregando folgas…</p>}
  </section>;
}