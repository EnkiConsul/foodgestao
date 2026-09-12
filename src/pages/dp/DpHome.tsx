import { Helmet } from "react-helmet-async";
import { Bell, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { PendenciasCard } from "@/components/dp/home/PendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { KpiCards } from "@/components/dp/home/KpiCards";
import { MenusPrincipaisCards } from "@/components/dp/home/MenusPrincipaisCards";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function DpHome() {
  const isMobile = useIsMobile();

  return (
    <DpPage>
      <Helmet><title>Pessoas 360° — Início</title></Helmet>

      <DpPageHeader
        icon={Bell}
        title="Pessoas 360°"
        description="Visão geral e atalhos rápidos."
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="icon" aria-label="Configurações">
                <Link to="/dp/configuracoes"><Settings className="h-4 w-4" /></Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Configurações</TooltipContent>
          </Tooltip>
        }
      />

      {isMobile && <MenusPrincipaisCards />}

      <KpiCards />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 min-w-0">
        <PendenciasCard />
        <AniversariantesCard />
      </div>

      <AtalhosFavoritos />
    </DpPage>
  );
}
