import { Link } from "react-router-dom";
import { useCurrentSubscription } from "@/hooks/useCurrentSubscription";
import { AlertTriangle, Clock } from "lucide-react";

export function SubscriptionBanner() {
  const { data: sub } = useCurrentSubscription();
  if (!sub) return null;

  if (sub.isExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2 text-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Seu período de teste expirou. Escolha um plano para reativar o acesso.</span>
        </div>
        <Link to="/planos" className="font-semibold hover:underline">Escolher plano</Link>
      </div>
    );
  }

  if (sub.status === "past_due") {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 text-destructive px-4 py-2 text-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          <span>Sua assinatura está com pagamento atrasado.</span>
        </div>
        <Link to="/planos" className="font-semibold hover:underline">Regularizar</Link>
      </div>
    );
  }

  if (sub.isTrialing && (sub.trialDaysLeft ?? 0) <= 3) {
    return (
      <div className="bg-amber-500/10 border-b border-amber-500/30 text-amber-700 dark:text-amber-400 px-4 py-2 text-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <span>
            {sub.trialDaysLeft && sub.trialDaysLeft > 0
              ? `Seu trial termina em ${sub.trialDaysLeft} dia${sub.trialDaysLeft === 1 ? "" : "s"}.`
              : "Seu trial expira hoje."}
          </span>
        </div>
        <Link to="/planos" className="font-semibold hover:underline">Fazer upgrade</Link>
      </div>
    );
  }

  return null;
}
