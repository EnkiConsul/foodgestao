import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DiasEmLista } from "@/components/dp/DiasEmLista";
import { cn } from "@/lib/utils";
import {
  ausenciasVisiveis, primeiroNome, TIPO_AUSENCIA_LABEL, TIPOS_AUSENCIA, type TipoAusenciaCalendario,
} from "@/lib/dp/calendario-rotina";
import type { DiaPanorama } from "@/hooks/useDpOperacaoPanorama";

const TOM: Record<TipoAusenciaCalendario, string> = {
  folga: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  ferias: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  falta: "bg-destructive/15 text-destructive border-destructive/30",
  atestado: "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30",
  outras: "bg-muted text-muted-foreground border-border",
};

const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Props {
  dias: DiaPanorama[];
  selecionado: string;
  filtros: TipoAusenciaCalendario[];
  onFiltros: (f: TipoAusenciaCalendario[]) => void;
  onAbrirDia: (iso: string) => void;
}

export function CalendarioAusenciasMes({ dias, selecionado, filtros, onFiltros, onAbrirDia }: Props) {
  const alternar = (t: TipoAusenciaCalendario) =>
    onFiltros(filtros.includes(t) ? filtros.filter((x) => x !== t) : [...filtros, t]);

  const offset = dias.length ? new Date(`${dias[0].data}T12:00:00`).getDay() : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3">
        <span className="text-xs font-medium text-muted-foreground">Mostrar:</span>
        {TIPOS_AUSENCIA.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox checked={filtros.includes(t)} onCheckedChange={() => alternar(t)} />
            <span className={cn("rounded border px-1.5 text-xs", TOM[t])}>{TIPO_AUSENCIA_LABEL[t]}</span>
          </label>
        ))}
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onFiltros([...TIPOS_AUSENCIA])}>Marcar todos</Button>
          <Button size="sm" variant="ghost" onClick={() => onFiltros([])}>Desmarcar</Button>
        </div>
      </div>

      {/* Mobile: 1 dia = 1 linha, como no calendário de folgas */}
      <div className="md:hidden">
        <DiasEmLista
          dias={dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            return {
              iso: d.data,
              selecionado: d.data === selecionado,
              tom: d.alerta ? (d.avaliacao.situacao === "abaixo" ? ("critico" as const) : ("atencao" as const)) : undefined,
              onSelect: () => onAbrirDia(d.data),
              resumo: (
                <span>
                  <span className="font-semibold text-foreground">{d.trabalhando}</span> trabalham
                  {aus.length ? ` · ${aus.length} ausente(s)` : ""}
                </span>
              ),
              chips: (
                <>
                  {d.feriado_nome && <Badge variant="outline" className="text-[10px]">Feriado · {d.feriado_nome}</Badge>}
                  {aus.map((a) => (
                    <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("rounded border px-1.5 text-[10px]", TOM[a.tipo])}>
                      {primeiroNome(a.nome)}
                    </span>
                  ))}
                </>
              ),
            };
          })}
        />
      </div>

      {/* Desktop: grade mensal com ausentes em cada dia */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
          {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => <div key={`v${i}`} />)}
          {dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            const extra = aus.length - 5;
            return (
              <button
                key={d.data}
                type="button"
                onClick={() => onAbrirDia(d.data)}
                className={cn(
                  "flex min-h-[110px] flex-col gap-1 rounded-lg border bg-card p-1.5 text-left transition-colors hover:bg-accent/40",
                  d.data === selecionado && "ring-2 ring-primary",
                  d.alerta && d.avaliacao.situacao === "abaixo" && "border-destructive/50",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{Number(d.data.slice(8))}</span>
                  <span className="text-[10px] text-muted-foreground">{d.trabalhando} trab.</span>
                </div>
                {d.feriado_nome && <span className="truncate text-[10px] text-primary">{d.feriado_nome}</span>}
                {aus.slice(0, 5).map((a) => (
                  <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("truncate rounded border px-1 text-[10px]", TOM[a.tipo])} title={`${a.nome} · ${TIPO_AUSENCIA_LABEL[a.tipo]}`}>
                    {primeiroNome(a.nome)}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
