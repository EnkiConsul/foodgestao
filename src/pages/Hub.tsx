import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle, Sparkles, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { MODULES, isModuleUsable, statusLabel, type ModuleDefinition, type ModuleStatus } from "@/lib/modules";
import { cn } from "@/lib/utils";

function statusBadge(status: ModuleStatus, available: boolean) {
  if (!available) {
    return <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> Em breve</Badge>;
  }
  if (status === "active") return <Badge className="gap-1 bg-primary"><CheckCircle2 className="h-3 w-3" /> Ativo</Badge>;
  if (status === "trial") return <Badge className="gap-1 bg-primary/80"><CheckCircle2 className="h-3 w-3" /> Trial</Badge>;
  if (status === "suspended") return <Badge variant="destructive" className="gap-1"><Lock className="h-3 w-3" /> Suspenso</Badge>;
  return <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Não contratado</Badge>;
}

function ModuleCard({ def, status }: { def: ModuleDefinition; status: ModuleStatus }) {
  const Icon = def.icon;
  const usable = def.available && isModuleUsable(status);
  const waMsg = encodeURIComponent(`Olá! Tenho interesse em contratar o módulo ${def.name} no 360°FOOD.`);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all",
        usable
          ? "hover:shadow-lg hover:-translate-y-1 border-primary/20"
          : "opacity-90",
      )}
    >
      <CardContent className="p-6 flex flex-col h-full min-h-[220px]">
        <div className="flex items-start justify-between mb-4">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              usable ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          {statusBadge(status, def.available)}
        </div>
        <h3 className="text-lg font-semibold mb-1">{def.name}</h3>
        <p className="text-sm text-muted-foreground flex-1">{def.description}</p>
        <div className="pt-4">
          {usable ? (
            <Button asChild className="w-full group-hover:translate-x-1 transition-transform">
              <Link to={def.entryRoute}>
                Entrar <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          ) : def.available ? (
            <Button asChild variant="outline" className="w-full">
              <a
                href={`https://wa.me/5562992365959?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-2" /> Contratar
              </a>
            </Button>
          ) : (
            <Button variant="outline" className="w-full" disabled>
              Em breve
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Hub() {
  const { contextType, companies, selectedCompanyId } = useCompanyContext();
  const { getStatus, isLoading } = useCompanyModules();

  const contextLabel = contextType === "pj"
    ? companies.find((c) => c.id === selectedCompanyId)?.name ?? "Empresa"
    : "Pessoa Física";

  return (
    <div className="mx-auto max-w-6xl">
      <Helmet>
        <title>Hub de Módulos — 360°FOOD</title>
        <meta name="description" content="Acesse os módulos contratados: Financeiro, DP, CRM, RH e Pedidos." />
      </Helmet>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-1">{contextLabel}</p>
        <h1 className="text-3xl font-bold">Hub de Módulos</h1>
        <p className="text-muted-foreground mt-2">
          Selecione um módulo para começar. Cada módulo é uma contratação independente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((def) => (
          <ModuleCard
            key={def.slug}
            def={def}
            status={isLoading ? "not_contracted" : getStatus(def.slug)}
          />
        ))}
      </div>
    </div>
  );
}
