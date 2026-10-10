import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DiasEmLista } from "@/components/dp/DiasEmLista";
import { cn } from "@/lib/utils";
import {
  ausenciasVisiveis, primeiroNome, TIPO_AUSENCIA_LABEL, TIPOS_AUSENCIA, type TipoAusenciaCalendario,
} from "@/lib/dp/calendario-rotina";
import type { DiaPanorama } from "@/hooks/useDpOperacaoPanorama";

// Mesmas cores do Calendário de Folgas.
const TOM: Record<TipoAusenciaCalendario, string> = {
  folga: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ferias: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  falta: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
  atestado: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  outras: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
};

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Dias do mês anterior/seguinte que completam a primeira e a última semana. */
function diasDePreenchimento(dias: DiaPanorama[]) {
  if (!dias.length) return { antes: [] as string[], depois: [] as string[] };
  const ini = new Date(`${dias[0].data}T12:00:00`);
  const fim = new Date(`${dias[dias.length - 1].data}T12:00:00`);
  const antes: string[] = [];
  for (let i = ini.getDay(); i > 0; i--) {
    const d = new Date(ini); d.setDate(ini.getDate() - i); antes.push(isoLocal(d));
  }
  const depois: string[] = [];
  for (let i = 1; i <= 6 - fim.getDay(); i++) {
    const d = new Date(fim); d.setDate(fim.getDate() + i); depois.push(isoLocal(d));
  }
  return { antes, depois };
}

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

  const { antes, depois } = diasDePreenchimento(dias);
  const hoje = isoLocal(new Date());
  const vazio = (iso: string) => (
    <div key={iso} className="flex min-h-[112px] flex-col bg-muted/10 p-2 text-muted-foreground">
      <span className="text-sm font-semibold opacity-60">{Number(iso.slice(8))}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3">
        <span className="text-xs font-medium text-muted-foreground">Mostrar:</span>
        {TIPOS_AUSENCIA.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox checked={filtros.includes(t)} onCheckedChange={() => alternar(t)} />
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TOM[t])}>{TIPO_AUSENCIA_LABEL[t]}</span>
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
                  {d.feriado_nome && <Badge variant="outline" className="text-[10px]">Feriado</Badge>}
                  {aus.map((a) => (
                    <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", TOM[a.tipo])}>
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
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[hsl(var(--dp-border))] bg-[hsl(var(--dp-border))]">
          {DOW.map((d) => (
            <div key={d} className="bg-muted/40 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{d}</div>
          ))}
          {antes.map(vazio)}
          {dias.map((d) => {
            const aus = ausenciasVisiveis(d.pessoas, filtros);
            const extra = aus.length - 5;
            return (
              <button
                key={d.data}
                type="button"
                onClick={() => onAbrirDia(d.data)}
                className={cn(
                  "flex min-h-[112px] flex-col gap-1.5 bg-card p-2 text-left transition-colors hover:bg-muted/30",
                  d.data === selecionado && "ring-2 ring-inset ring-primary",
                  d.alerta && d.avaliacao.situacao === "abaixo" && "bg-destructive/5",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex min-w-0 items-center gap-1">
                    <span className={cn("text-sm font-semibold", d.data === hoje && "text-primary")}>{Number(d.data.slice(8))}</span>
                    {d.feriado_nome && (
                      <Badge variant="outline" className="truncate border-primary/50 bg-primary/10 px-1 py-0 text-[10px] text-primary" title={d.feriado_nome}>
                        Feriado
                      </Badge>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{d.trabalhando} trab.</span>
                </div>
                {aus.slice(0, 5).map((a) => (
                  <span key={`${a.colaborador_id}-${a.tipo}`} className={cn("truncate rounded-full px-2 py-0.5 text-center text-[10px] font-semibold uppercase", TOM[a.tipo])} title={`${a.nome} · ${TIPO_AUSENCIA_LABEL[a.tipo]}`}>
                    {primeiroNome(a.nome)}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
              </button>
            );
          })}
          {depois.map(vazio)}
        </div>
      </div>
    </div>
  );
}
