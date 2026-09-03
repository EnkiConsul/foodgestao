import { Link } from "react-router-dom";
import { MessageCircle, ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { isModuleUsable, MODULE_BY_SLUG, type AppModule, statusLabel } from "@/lib/modules";

interface ModuleGuardProps {
  module: AppModule;
  children: React.ReactNode;
}

/**
 * Bloqueia rotas de módulos não contratados/suspensos.
 * Exibe tela com CTA de contratação via WhatsApp.
 */
export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const { getStatus, isLoading } = useCompanyModules();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const status = getStatus(module);
  if (isModuleUsable(status)) return <>{children}</>;

  const def = MODULE_BY_SLUG[module];
  const Icon = def.icon;
  const waMsg = encodeURIComponent(
    `Olá! Tenho interesse em contratar o módulo ${def.name} no Aveto 360.`,
  );

  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <CardContent className="p-8 text-center space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{def.name}</h1>
            <p className="text-muted-foreground">{def.description}</p>
            <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium">
              <Lock className="h-3 w-3" /> {statusLabel(status)}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Este módulo ainda não faz parte da sua contratação. Fale com nossa equipe
            para ativar em sua conta.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <a
                href={`https://wa.me/5562992365959?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Contratar via WhatsApp
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/hub">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Voltar ao Hub
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
