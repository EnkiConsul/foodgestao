import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CoverageColaborador } from "@/lib/dp/bulk-coverage";
import { cn } from "@/lib/utils";

export interface ColaboradoresFaltantesPanelProps {
  faltantes: CoverageColaborador[];
  totalEsperados: number;
  competencia: string | null;
  /** nenhuma unidade identificada no lote */
  unidadeIndefinida?: boolean;
  /** seletor de unidade renderizado quando a unidade não foi identificada */
  unidadeSlot?: ReactNode;
  className?: string;
  /** Intermitente sem trabalho na competência: dispensa o documento do mês. */
  onNaoTrabalhou?: (c: CoverageColaborador) => void;
  podeDispensar?: (c: CoverageColaborador) => boolean;
  dispensandoId?: string | null;
  /** Intermitentes já dispensados nesta competência (permite desfazer). */
  dispensados?: { id: string; nome: string }[];
  onDesfazer?: (id: string) => void;
  desfazendoId?: string | null;
}

export function ColaboradoresFaltantesPanel({
  faltantes, totalEsperados, competencia, unidadeIndefinida, unidadeSlot, className,
  onNaoTrabalhou, podeDispensar, dispensandoId, dispensados = [], onDesfazer, desfazendoId,
}: ColaboradoresFaltantesPanelProps) {
  const [open, setOpen] = useState(false);

  const rodape = dispensados.length > 0 ? (
    <div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-muted-foreground">
      <p>
        {dispensados.length === 1
          ? "1 colaborador intermitente dispensado nesta competência:"
          : `${dispensados.length} colaboradores intermitentes dispensados nesta competência:`}
      </p>
      <ul className="space-y-1">
        {dispensados.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{d.nome}</span>
            {onDesfazer && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                disabled={desfazendoId === d.id}
                onClick={() => onDesfazer(d.id)}
              >
                {desfazendoId === d.id ? "Desfazendo…" : "Desfazer"}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  if (unidadeIndefinida) {
    return (
      <div className={cn(
        "rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs",
        className,
      )}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Unidade Não Identificada
            </p>
            <p className="text-muted-foreground mt-0.5">
              Não conseguimos identificar a unidade deste lote. Vincule manualmente uma unidade
              (ou cadastre uma nova) para conferir os colaboradores sem documento.
            </p>
            {unidadeSlot && <div className="mt-2">{unidadeSlot}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (totalEsperados === 0) {
    return rodape ? <div className={cn("rounded-md border p-2.5 text-xs", className)}>{rodape}</div> : null;
  }

  const cobertos = totalEsperados - faltantes.length;
  const compLabel = competencia
    ? `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`
    : "competência não identificada";

  if (faltantes.length === 0) {
    return (
      <div className={cn(
        "rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5 text-xs",
        className,
      )}>
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Todos os {totalEsperados} colaboradores têm documento ({compLabel})
        </p>
        {rodape}
      </div>
    );
  }

  return (
    <div className={cn(
      "rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs",
      className,
    )}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            {cobertos} de {totalEsperados} colaboradores com documento ({compLabel})
          </p>
          <p className="text-muted-foreground mt-0.5">
            {faltantes.length} colaborador(es) ativo(s) no período sem documento neste lote.
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1.5 mt-1 text-xs"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 mr-1 transition-transform", open && "rotate-180")} />
            {open ? "Ocultar lista" : "Ver quem está faltando"}
          </Button>
          {open && (
            <ul className="mt-1.5 space-y-1 max-h-48 overflow-auto pr-1">
              {faltantes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{c.nome}</span>
                  {c.matricula && (
                    <span className="text-muted-foreground font-mono">#{c.matricula}</span>
                  )}
                  {c.dp_unidades?.nome && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                      {c.dp_unidades.nome}
                    </Badge>
                  )}
                  {c.ativo === false && (
                    <span className="text-[10px] text-muted-foreground">(inativo hoje)</span>
                  )}
                  {onNaoTrabalhou && podeDispensar?.(c) && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[11px] ml-auto"
                      disabled={dispensandoId === c.id}
                      onClick={() => onNaoTrabalhou(c)}
                    >
                      {dispensandoId === c.id ? "Registrando…" : "Não Trabalhou no Mês"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {rodape}
        </div>
      </div>
    </div>
  );
}
