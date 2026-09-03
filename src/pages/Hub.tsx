import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, MessageCircle, Sparkles, Lock, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { useCompanyModules } from "@/hooks/useCompanyModules";
import { useModulosCatalogo } from "@/hooks/useModulosCatalogo";
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
  const waMsg = encodeURIComponent(`Olá! Tenho interesse em contratar o módulo ${def.name} no Aveto 360.`);

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all",
        usable
          ? "hover:shadow-lg md:hover:-translate-y-1 border-primary/20"
          : "opacity-90",
      )}
    >
      <CardContent className="p-3 md:p-6 flex flex-col h-full min-h-[160px] md:min-h-[220px]">
        <div className="flex items-start justify-between mb-2 md:mb-4 gap-2">
          <div
            className={cn(
              "flex h-9 w-9 md:h-12 md:w-12 items-center justify-center rounded-lg md:rounded-xl shrink-0",
              usable ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4 md:h-6 md:w-6" />
          </div>
          <div className="scale-[0.85] origin-top-right md:scale-100">
            {statusBadge(status, def.available)}
          </div>
        </div>
        <h3 className="text-sm md:text-lg font-semibold mb-1 leading-tight">{def.name}</h3>
        <p className="text-[11px] md:text-sm text-muted-foreground flex-1 line-clamp-3 md:line-clamp-none leading-snug">{def.description}</p>
        <div className="pt-3 md:pt-4">
          {usable ? (
            <Button asChild size="sm" className="w-full h-8 md:h-10 text-xs md:text-sm md:group-hover:translate-x-1 md:transition-transform">
              <Link to={def.entryRoute}>
                Entrar <ArrowRight className="h-3 w-3 md:h-4 md:w-4 ml-1.5 md:ml-2" />
              </Link>
            </Button>
          ) : def.available ? (
            <Button asChild variant="outline" size="sm" className="w-full h-8 md:h-10 text-xs md:text-sm">
              <a
                href={`https://wa.me/5562992365959?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-3 w-3 md:h-4 md:w-4 mr-1.5 md:mr-2" /> Contratar
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full h-8 md:h-10 text-xs md:text-sm" disabled>
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
  const { data: catalogo } = useModulosCatalogo();

  // Somente módulos ativos e marcados para aparecer no Hub (backoffice).
  // Enquanto o catálogo não carrega, mantém a lista padrão.
  const hubCandidates = MODULES.filter((def) => !def.parent);
  const visibleModules = catalogo
    ? hubCandidates.filter((def) => {
        const entry = catalogo.find((c) => c.slug === def.slug);
        return entry ? entry.show_on_hub : false;
      })
    : hubCandidates;


  const contextLabel = companies.find((c) => c.id === selectedCompanyId)?.name ?? "Empresa";

  return (
    <div className="mx-auto max-w-6xl">
      <Helmet>
        <title>Hub de Módulos — Aveto 360</title>
        <meta name="description" content="Acesse os módulos contratados: Financeiro e Pessoas." />
      </Helmet>

      <div className="mb-6 md:mb-8">
        <p className="text-xs md:text-sm text-muted-foreground mb-1">{contextLabel}</p>
        <h1 className="text-xl md:text-3xl font-bold">Hub de Módulos</h1>
        <p className="text-xs md:text-base text-muted-foreground mt-1 md:mt-2">
          Selecione um módulo para começar. Cada módulo é uma contratação independente.
        </p>
      </div>

      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-3">
        {visibleModules.map((def) => (
          <ModuleCard
            key={def.slug}
            def={def}
            status={isLoading ? "not_contracted" : getStatus(def.slug)}
          />
        ))}
      </div>
      {visibleModules.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum módulo disponível no momento.</p>
      )}
    </div>
  );
}
