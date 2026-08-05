import { Link } from "react-router-dom";
import { ArrowLeft, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useOrdersEntitlement } from "@/hooks/useOrdersEntitlement";
import type { OrdersPermissionKey } from "@/lib/orders/permissions";
import { OrdersTrialBanner } from "@/components/orders/OrdersTrialBanner";

interface Props {
  operation?: OrdersPermissionKey;
  children: React.ReactNode;
}

/**
 * Protege rotas internas do módulo Pedidos.
 * O backend é a fonte da verdade (`can_use_orders_module`); aqui apenas
 * evitamos renderizar telas sem direito de uso (fail closed).
 */
export function OrdersGuard({ operation = "orders.dashboard", children }: Props) {
  const { entitlement, isLoading } = useOrdersEntitlement(operation);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!entitlement.allowed) {
    const isNotContracted = entitlement.effective_status === "not_contracted";
    return (
      <div className="mx-auto max-w-2xl py-10">
        <Card>
          <CardContent className="space-y-6 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              {isNotContracted ? (
                <Lock className="h-8 w-8 text-muted-foreground" />
              ) : (
                <ShieldAlert className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Acesso bloqueado</h1>
              <p className="text-muted-foreground">
                {entitlement.reason === "missing_permission"
                  ? "Você não tem permissão para esta função do módulo Pedidos. Fale com o proprietário da empresa."
                  : entitlement.reason === "trial_expired"
                    ? "O teste gratuito terminou. Contrate o módulo para voltar a operar."
                    : entitlement.reason === "not_member"
                      ? "Você não tem vínculo com a empresa selecionada."
                      : "Este módulo não está disponível para a empresa selecionada."}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link to="/pedidos">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao módulo Pedidos
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <OrdersTrialBanner entitlement={entitlement} />
      {children}
    </>
  );
}
