import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanyAccess } from "@/hooks/useCompanyAccess";

/**
 * Aviso no topo do sistema durante a tolerância de 10 dias após o vencimento.
 * Passados os 10 dias, o acesso é suspenso pelo SubscriptionGuard.
 */
export function AtrasoPagamentoBanner() {
  const { access, blocked, loading } = useCompanyAccess();
  const dias = access?.diasAtraso ?? 0;

  if (loading || blocked || dias <= 0) return null;

  const restantes = Math.max(0, 10 - dias);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      <span>
        Sua mensalidade está vencida há {dias} {dias === 1 ? "dia" : "dias"}. O acesso é suspenso em{" "}
        {restantes} {restantes === 1 ? "dia" : "dias"} se o pagamento não for confirmado.
      </span>
      <Button asChild size="sm" className="ml-auto">
        <Link
          to={
            access?.faturaPendenteId
              ? `/checkout/pagamento/${access.faturaPendenteId}`
              : "/assinatura"
          }
        >
          Regularizar
        </Link>
      </Button>
    </div>
  );
}
