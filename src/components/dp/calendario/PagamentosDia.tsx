import { Banknote, HandCoins, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MarcoPagamento, MarcoPagamentoTipo } from "@/lib/dp/pagamentos-marcos";

const ICONE: Record<MarcoPagamentoTipo, typeof Banknote> = {
  salario: Banknote,
  adiantamento: HandCoins,
  va: UtensilsCrossed,
};

export function IconePagamento({ tipo, className }: { tipo: MarcoPagamentoTipo; className?: string }) {
  const Icone = ICONE[tipo];
  return <Icone className={cn("h-3.5 w-3.5 shrink-0 text-success", className)} aria-hidden="true" />;
}

const textoAcessivel = (m: MarcoPagamento & { unidades?: string[] }) =>
  `Previsão de ${m.rotulo.toLowerCase()}${m.unidades?.length ? ` · ${m.unidades.join(", ")}` : ""}`;

/** Pílula curta para a linha do dia (celular) e a célula do mês. */
export function PilulaPagamento({ marco, className }: { marco: MarcoPagamento & { unidades?: string[] }; className?: string }) {
  return (
    <span
      title={marco.detalhe}
      aria-label={textoAcessivel(marco)}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success",
        className,
      )}
    >
      <IconePagamento tipo={marco.tipo} className="h-3 w-3" />
      {marco.curto}
    </span>
  );
}

/** Ícones discretos para células pequenas (só o ícone, nome no rótulo acessível). */
export function IconesPagamento({ marcos }: { marcos: (MarcoPagamento & { unidades?: string[] })[] }) {
  if (!marcos.length) return null;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={marcos.map(textoAcessivel).join("; ")} title={marcos.map((m) => m.rotulo).join(" · ")}>
      {marcos.map((m) => <IconePagamento key={m.tipo} tipo={m.tipo} />)}
    </span>
  );
}

/** Lista explicativa mostrada ao abrir o dia. */
export function PagamentosDoDia({ marcos, className }: { marcos: (MarcoPagamento & { unidades?: string[] })[]; className?: string }) {
  if (!marcos.length) return null;
  return (
    <ul className={cn("space-y-1.5", className)} aria-label="Previsão de pagamentos do dia">
      {marcos.map((m) => (
        <li key={`${m.tipo}-${m.data}`} className="flex items-start gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
          <IconePagamento tipo={m.tipo} className="mt-0.5 h-4 w-4" />
          <div className="min-w-0 text-xs">
            <p className="font-semibold text-foreground">Previsão de {m.rotulo.toLowerCase()}</p>
            <p className="text-muted-foreground">{m.detalhe}</p>
            {m.unidades && m.unidades.length > 0 && <p className="truncate text-muted-foreground" title={m.unidades.join(", ")}>{m.unidades.join(" · ")}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
