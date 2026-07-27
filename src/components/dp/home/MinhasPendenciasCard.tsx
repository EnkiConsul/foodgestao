import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Bell, ArrowRight, Clock, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpPendenciasColaborador } from "@/hooks/useDpPendenciasColaborador";

/**
 * Pendências do próprio colaborador no portal. Não usa o card administrativo
 * (que tem escopo da empresa inteira).
 */
export function MinhasPendenciasCard() {
  const { data = [], isLoading } = useDpPendenciasColaborador();

  const counters = useMemo(() => {
    let atrasado = 0;
    for (const p of data) if (p.atrasoDias > 0) atrasado++;
    return { atrasado };
  }, [data]);

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Bell className="h-5 w-5 text-primary shrink-0" />
        <h2 className="text-base sm:text-lg font-semibold min-w-0 break-words">Minhas Pendências</h2>
        <Badge className="ml-auto bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2 shrink-0">
          {data.length}
        </Badge>
      </div>

      {counters.atrasado > 0 && (
        <p className="text-xs text-destructive mb-3">
          {counters.atrasado} {counters.atrasado === 1 ? "item atrasado" : "itens atrasados"}
        </p>
      )}

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 opacity-40" />
            <p className="text-sm">Tudo em dia por aqui. 🎉</p>
          </div>
        )}
        {data.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 rounded-xl bg-card border border-[hsl(var(--dp-border))] p-3"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <p.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{p.titulo}</p>
                {p.vencimento && (
                  p.atrasoDias > 0 ? (
                    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] shrink-0">
                      <Clock className="h-3 w-3 mr-1" /> Atrasado {p.atrasoDias}d
                    </Badge>
                  ) : p.atrasoDias === 0 ? (
                    <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900 text-[10px] shrink-0">
                      <Clock className="h-3 w-3 mr-1" /> Vence hoje
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 text-[10px] shrink-0">
                      <Clock className="h-3 w-3 mr-1" /> Em {Math.abs(p.atrasoDias)}d
                    </Badge>
                  )
                )}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2">{p.subtitulo}</p>
              <Button asChild size="sm" className="mt-2 h-9 sm:h-7 text-xs w-full sm:w-auto">
                <Link to={p.url}>
                  Resolver <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
