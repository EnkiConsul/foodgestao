import { Clock, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdersEntitlement } from "@/lib/orders/entitlement";

/** Banner de status do trial / modo consulta do módulo Pedidos. */
export function OrdersTrialBanner({ entitlement }: { entitlement: OrdersEntitlement }) {
  const status = entitlement.effective_status;

  if (status === "trial") {
    const days = entitlement.days_left ?? 0;
    const urgent = days <= 2;
    return (
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm",
          urgent ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/5",
        )}
      >
        <Clock className={cn("h-4 w-4 shrink-0", urgent ? "text-destructive" : "text-primary")} />
        <span className="flex-1 min-w-0">
          Teste gratuito do Pedidos 360°: <strong>{days} {days === 1 ? "dia" : "dias"}</strong> restantes
          {entitlement.trial_ends_at
            ? ` (encerra em ${new Date(entitlement.trial_ends_at).toLocaleDateString("pt-BR")})`
            : ""}
          .
        </span>
        <Button asChild size="sm" variant={urgent ? "destructive" : "default"}>
          <a
            href={`https://wa.me/5562992365959?text=${encodeURIComponent(
              "Olá! Quero contratar o módulo Pedidos 360° no 360°FOOD.",
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Contratar
          </a>
        </Button>
      </div>
    );
  }

  if (status === "trial_expirado" || status === "suspended" || status === "canceled") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
        <Lock className="h-4 w-4 shrink-0 text-destructive" />
        <span className="flex-1 min-w-0">
          {status === "trial_expirado"
            ? "Seu teste gratuito terminou. O módulo está em modo consulta: novas operações estão bloqueadas."
            : "Módulo indisponível. Acesso limitado à consulta dos dados já registrados."}
        </span>
        <Button asChild size="sm" variant="outline">
          <Link to="/hub">Ver módulos</Link>
        </Button>
      </div>
    );
  }

  return null;
}
