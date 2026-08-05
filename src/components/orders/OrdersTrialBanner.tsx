import { Clock, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdersEntitlement } from "@/lib/orders/entitlement";
import {
  formatTrialDeadline,
  formatTrialTimeLeft,
  ordersTrialCountdown,
} from "@/lib/orders/trial";

/** Banner de status do trial / modo consulta do módulo Pedidos. */
export function OrdersTrialBanner({ entitlement }: { entitlement: OrdersEntitlement }) {
  const status = entitlement.effective_status;

  if (status === "trial") {
    const countdown = ordersTrialCountdown(entitlement.trial_ends_at);
    const urgent = countdown.level === "critical" || countdown.level === "warning";
    const deadline = formatTrialDeadline(entitlement.trial_ends_at);
    return (
      <div
        className={cn(
          "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm",
          urgent ? "border-destructive/40 bg-destructive/10" : "border-primary/30 bg-primary/5",
        )}
      >
        <Clock className={cn("h-4 w-4 shrink-0", urgent ? "text-destructive" : "text-primary")} />
        <span className="flex-1 min-w-0">
          Teste gratuito do Pedidos 360°: restam{" "}
          <strong>{formatTrialTimeLeft(countdown)}</strong>
          {deadline ? ` — encerra em ${deadline}` : ""}.
          {countdown.isLastDay
            ? " Depois desse horário o módulo entra em modo consulta e novos pedidos são bloqueados."
            : ""}
        </span>
        <Button asChild size="sm" variant={urgent ? "destructive" : "default"}>
          <Link to="/pedidos/assinatura">Contratar</Link>
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
            ? "Seu teste gratuito terminou. O módulo está em modo consulta: os dados continuam disponíveis, mas novas operações estão bloqueadas."
            : "Módulo indisponível. Acesso limitado à consulta dos dados já registrados."}
        </span>
        <Button asChild size="sm" variant="destructive">
          <Link to="/pedidos/assinatura">Contratar módulo</Link>
        </Button>
      </div>
    );
  }

  return null;
}
