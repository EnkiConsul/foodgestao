import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type EtapaLote = 1 | 2 | 3;

const ETAPAS: Array<{ n: EtapaLote; titulo: string; curto: string }> = [
  { n: 1, titulo: "Unidade e sindicato", curto: "Unidade" },
  { n: 2, titulo: "Cargos e setores", curto: "Cargos" },
  { n: 3, titulo: "Conferir fichas", curto: "Fichas" },
];

/** Navegação das três etapas do lote: compacta no celular, sem rolagem lateral. */
export function FichaLoteEtapas({
  atual, concluidas, onIr,
}: { atual: EtapaLote; concluidas: EtapaLote[]; onIr: (e: EtapaLote) => void }) {
  return (
    <nav aria-label="Etapas do lote" className="grid grid-cols-3 gap-1.5 rounded-xl border bg-card p-1.5">
      {ETAPAS.map((e) => {
        const ativa = e.n === atual;
        const feita = concluidas.includes(e.n);
        return (
          <button
            key={e.n}
            type="button"
            onClick={() => onIr(e.n)}
            aria-current={ativa ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-medium transition-colors sm:text-sm",
              ativa ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                ativa ? "bg-primary-foreground/20" : feita ? "bg-primary/15 text-primary" : "bg-muted",
              )}
            >
              {feita && !ativa ? <Check className="h-3 w-3" /> : e.n}
            </span>
            <span className="truncate sm:hidden">{e.curto}</span>
            <span className="hidden truncate sm:inline">{e.titulo}</span>
          </button>
        );
      })}
    </nav>
  );
}
