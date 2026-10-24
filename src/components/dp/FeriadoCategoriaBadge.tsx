import { Badge } from "@/components/ui/badge";
import { FERIADO_CATEGORIA_LABEL, type FeriadoCategoria } from "@/lib/dp/feriados";
import type { FeriadoDia } from "@/lib/dp/feriados-apresentacao";

const tons: Record<FeriadoCategoria, string> = {
  nacional: "border-primary/30 bg-primary/10 text-primary",
  estadual: "border-calendar-ferias/30 bg-calendar-ferias/10 text-calendar-ferias",
  municipal: "border-calendar-dominical/30 bg-calendar-dominical/10 text-calendar-dominical",
  sindicato: "border-calendar-atestado/30 bg-calendar-atestado/10 text-calendar-atestado",
};
export function FeriadoCategoriaBadge({ categoria }: { categoria: FeriadoCategoria }) {
  return <Badge variant="outline" className={tons[categoria]}>{FERIADO_CATEGORIA_LABEL[categoria]}</Badge>;
}
export function FeriadosDia({ dia }: { dia: { feriado_nome: string | null; feriados?: FeriadoDia[] } }) {
  if (!dia.feriado_nome) return null;
  return <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs">
    {dia.feriados?.length ? dia.feriados.map((f) => <span key={`${f.categoria}-${f.nome}`} className="inline-flex min-w-0 flex-wrap items-center gap-1.5"><FeriadoCategoriaBadge categoria={f.categoria} /><span className="break-words">🎉 {f.nome}</span></span>) : <span className="break-words">🎉 {dia.feriado_nome}</span>}
  </span>;
}