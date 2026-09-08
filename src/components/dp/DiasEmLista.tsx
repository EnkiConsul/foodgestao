import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lista vertical de dias — padrão mobile dos calendários do Pessoas 360°.
 * Regra do módulo: no celular 1 dia = 1 linha. A grade de 7 colunas fica
 * restrita ao desktop. Este componente é só apresentação: quem usa continua
 * responsável pelos dados, estados e ações de cada dia.
 */
export interface DiaEmLista {
  /** Data no formato yyyy-MM-dd. */
  iso: string;
  /** Linha curta de apoio (ex.: "4 confirmados · 1 folga"). */
  resumo?: ReactNode;
  /** Selos do dia. */
  chips?: ReactNode;
  selecionado?: boolean;
  tom?: "neutro" | "atencao" | "critico" | "sucesso" | "primario";
  desabilitado?: boolean;
  onSelect?: () => void;
  titulo?: string;
}

const WEEKDAY = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MES_CURTO = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

const TOM: Record<NonNullable<DiaEmLista["tom"]>, string> = {
  neutro: "",
  primario: "bg-primary/5",
  sucesso: "bg-emerald-500/5",
  atencao: "bg-amber-500/5",
  critico: "bg-destructive/5",
};

const parse = (iso: string) => new Date(`${iso}T12:00:00`);
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function DiasEmLista({
  dias,
  rodape,
  className,
}: {
  dias: DiaEmLista[];
  rodape?: ReactNode;
  className?: string;
}) {
  const hoje = hojeIso();

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <ul className="divide-y divide-border">
        {dias.map((d) => {
          const data = parse(d.iso);
          const isToday = d.iso === hoje;
          const conteudo = (
            <>
              <div className="w-[4.5rem] shrink-0">
                <div
                  className={cn(
                    "text-[11px] font-semibold uppercase leading-none tracking-wide text-muted-foreground",
                    d.desabilitado && "text-muted-foreground/60",
                  )}
                >
                  {WEEKDAY[data.getDay()]}
                </div>
                <div
                  className={cn(
                    "mt-1 text-base font-bold leading-none tabular-nums",
                    isToday && "text-primary",
                    d.desabilitado && "text-muted-foreground/60",
                  )}
                >
                  {String(data.getDate()).padStart(2, "0")}
                  <span className="ml-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    {MES_CURTO[data.getMonth()]}
                  </span>
                </div>
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                {d.resumo ? <div className="text-sm leading-snug">{d.resumo}</div> : null}
                {d.chips ? <div className="flex flex-wrap gap-1.5">{d.chips}</div> : null}
              </div>

              {d.onSelect && !d.desabilitado ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              ) : null}
            </>
          );

          const base = cn(
            "flex w-full items-center gap-3 px-3 py-3 text-left",
            TOM[d.tom ?? "neutro"],
            isToday && !d.tom && "bg-primary/5",
            d.selecionado && "ring-1 ring-inset ring-primary",
          );

          return (
            <li key={d.iso}>
              {d.onSelect ? (
                <button
                  type="button"
                  title={d.titulo}
                  disabled={d.desabilitado}
                  onClick={d.onSelect}
                  className={cn(
                    base,
                    "min-h-[3.25rem] transition-colors hover:bg-muted/40 active:bg-muted/60",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                  )}
                >
                  {conteudo}
                </button>
              ) : (
                <div title={d.titulo} className={base}>
                  {conteudo}
                </div>
              )}
            </li>
          );
        })}
        {dias.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum dia para exibir neste período.
          </li>
        )}
      </ul>
      {rodape ? (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {rodape}
        </div>
      ) : null}
    </div>
  );
}
