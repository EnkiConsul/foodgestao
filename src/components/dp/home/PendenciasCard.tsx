import { Link } from "react-router-dom";
import { Bell, ArrowRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDpPendencias } from "@/hooks/useDpPendencias";

export function PendenciasCard() {
  const { data = [], isLoading } = useDpPendencias();

  return (
    <div className="rounded-2xl border-2 border-[hsl(var(--dp-pending-border))] bg-[hsl(var(--dp-pending-bg))] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Pendências do Sistema</h2>
        <Badge className="ml-1 bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
          {data.length}
        </Badge>
      </div>

      <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {!isLoading && data.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">Sem pendências. 🎉</p>
        )}
        {data.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 rounded-xl bg-white border border-[hsl(var(--dp-border))] p-3 hover:shadow-sm transition-shadow"
          >
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <p.icon className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium truncate">{p.titulo}</p>
                {p.atrasoDias != null && p.atrasoDias > 0 && (
                  <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive text-[10px] shrink-0">
                    <Clock className="h-3 w-3 mr-1" />
                    Atrasado {p.atrasoDias}d
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{p.subtitulo}</p>
              <div className="mt-2 flex gap-2">
                <Button asChild size="sm" variant="default" className="h-7 text-xs">
                  <Link to={p.url}>
                    Resolver <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
