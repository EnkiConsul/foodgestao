import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyPermissions } from "@/hooks/useCompanyPermissions";
import { itemDaRota } from "@/lib/permissionRoutes";
import { MODULE_LABELS } from "@/lib/permissions";

/** Bloqueia telas cujo item da matriz está como "Sem acesso" para o usuário. */
export function PermissionRouteGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { podeRota, carregado } = useCompanyPermissions();
  const item = itemDaRota(pathname);

  if (!item) return <>{children}</>;
  if (!carregado) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }
  if (podeRota(item)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-lg py-10">
      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold">Acesso Restrito</h1>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar "{MODULE_LABELS[item]}" nesta empresa. Fale com o administrador.
          </p>
          <Button asChild variant="outline">
            <Link to="/hub"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao Hub</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
