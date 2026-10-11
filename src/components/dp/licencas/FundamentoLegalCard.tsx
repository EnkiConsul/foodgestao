import { Scale, CalendarClock } from "lucide-react";
import { FUNDAMENTO_LEGAL, fimDeSemanaNoPeriodo, isTipoAfastamento } from "@/lib/dp/licencas";

/** Embasamento legal do tipo de ausência + aviso de boa prática quando cai no fim de semana. */
export function FundamentoLegalCard({ tipo, inicio, fim }: { tipo: string; inicio?: string; fim?: string | null }) {
  if (!isTipoAfastamento(tipo)) return null;
  const f = FUNDAMENTO_LEGAL[tipo];
  const fds = f.remarcarFolga && inicio ? fimDeSemanaNoPeriodo(inicio, fim) : [];
  return (
    <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-xs">
      <div className="flex items-center gap-1.5 font-medium">
        <Scale className="h-3.5 w-3.5" /> {f.artigo}
      </div>
      <div><span className="text-muted-foreground">Prazo:</span> {f.prazo}</div>
      <div><span className="text-muted-foreground">Contagem:</span> {f.contagem}</div>
      <div className="text-muted-foreground">{f.observacao}</div>
      {fds.length > 0 && (
        <div className="flex gap-1.5 rounded border border-primary/30 bg-primary/5 p-2">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            O período inclui sábado ou domingo. Se a folga do colaborador cair nesses dias, a boa prática é
            remarcá-la em comum acordo pelo calendário ("Remarcar Folga"). Enquanto isso, essa folga não pode ser trocada.
          </span>
        </div>
      )}
    </div>
  );
}
