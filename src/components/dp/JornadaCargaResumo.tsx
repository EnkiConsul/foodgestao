import { useState } from "react";
import { Info, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  calcularCargaTotalCadastrada,
  cargaEstimadaPorRegime,
  formatarHoras,
  simularCargaPorDiaDeFolga,
  validarCargaSemanal,
  type HorarioDia,
} from "@/lib/dp/jornada-utils";

interface Props {
  horarios: HorarioDia[];
  tipoEscala: string;
}

/**
 * Resumo de carga do cadastro da jornada.
 * Fica no fluxo normal do conteúdo (sem sticky/absolute) para não cobrir o primeiro dia.
 */
export function JornadaCargaResumo({ horarios, tipoEscala }: Props) {
  const [verSimulacao, setVerSimulacao] = useState(false);

  const total = calcularCargaTotalCadastrada(horarios);
  const estimada = cargaEstimadaPorRegime(horarios, tipoEscala);
  const simulacao = simularCargaPorDiaDeFolga(horarios);
  const excedeTotal = validarCargaSemanal(total).excede;
  const doze = tipoEscala === "12x36";

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Carga total cadastrada</p>
          <p className="text-2xl font-bold tabular-nums">{formatarHoras(total)}</p>
        </div>
        {estimada && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Carga estimada ({estimada.folgas} folga{estimada.folgas > 1 ? "s" : ""})
            </p>
            <p className="text-base font-semibold tabular-nums">
              {estimada.minima === estimada.maxima
                ? formatarHoras(estimada.minima)
                : `${formatarHoras(estimada.minima)} – ${formatarHoras(estimada.maxima)}`}
            </p>
          </div>
        )}
      </div>

      <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {doze
          ? "Jornada 12x36: a carga é apurada por ciclo de plantões gerados na escala, não pela soma dos dias da semana."
          : "Os horários dos sete dias foram cadastrados. A carga semanal efetiva será calculada conforme a folga semanal de cada colaborador."}
      </p>

      {excedeTotal && !doze && (
        <p className="mt-2 flex gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          A soma dos dias passa de 44 horas. Isso é normal quando a folga ainda não foi definida — o limite legal
          é validado no vínculo do colaborador ou na escala.
        </p>
      )}

      {simulacao.length > 1 && (
        <div className="mt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 text-xs"
            aria-expanded={verSimulacao}
            onClick={() => setVerSimulacao((v) => !v)}
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", verSimulacao && "rotate-180")} />
            Simular carga por dia de folga
          </Button>
          {verSimulacao && (
            <ul className="mt-1 space-y-1 rounded-lg border bg-background/60 p-2 text-xs">
              {simulacao.map((s) => (
                <li key={s.dia} className="flex items-center justify-between gap-3">
                  <span>Folga na {s.rotulo.toLowerCase()}</span>
                  <span className="tabular-nums font-medium">{formatarHoras(s.carga)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
