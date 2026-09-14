import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConvocacaoRemuneracao } from "@/lib/dp/convocacao-remuneracao";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  remuneracao: ConvocacaoRemuneracao;
  /** Começa aberto (telas do gestor) ou fechado (portal). */
  aberto?: boolean;
  /** Rótulo do resumo. Padrão: visão do colaborador. */
  titulo?: string;
  className?: string;
}

/**
 * Abertura do valor do dia: cada parcela que compõe a remuneração,
 * os descontos, o FGTS (depósito da empresa) e o total a receber.
 */
export function RemuneracaoDiaDetalhe({
  remuneracao: r,
  aberto = false,
  titulo = "Você recebe neste dia",
  className,
}: Props) {
  const [open, setOpen] = useState(aberto);

  return (
    <div className={cn("rounded-lg border border-border bg-muted/30 p-3 text-sm", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{titulo}</span>
          <span className="text-base font-semibold text-primary">{moeda(r.liquido)}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>


      {open ? (
        <div className="mt-3 space-y-1">
          {r.proventos.map((p) => (
            <div key={p.chave} className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                {p.label}
                {p.detalhe ? (
                  <span className="block text-xs text-muted-foreground">{p.detalhe}</span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{moeda(p.valor)}</span>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-medium">
            <span>Total bruto</span>
            <span className="tabular-nums">{moeda(r.bruto)}</span>
          </div>

          {r.descontosLista.map((p) => (
            <div key={p.chave} className="flex items-center justify-between gap-3 text-muted-foreground">
              <span>{p.label}</span>
              <span className="tabular-nums">− {moeda(p.valor)}</span>
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 border-t border-border pt-1 font-semibold">
            <span>Total a receber</span>
            <span className="tabular-nums text-primary">{moeda(r.liquido)}</span>
          </div>

          {r.fgts > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">
              FGTS depositado pela empresa neste dia: {moeda(r.fgts)} — não é descontado de você.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Valores estimados para este dia; o acerto final vem no recibo de pagamento.
          </p>
        </div>
      ) : null}
    </div>
  );
}
