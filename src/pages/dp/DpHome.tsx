import { AvisosGestorGate } from "@/components/dp/home/AvisosGestorGate";
import { Helmet } from "react-helmet-async";
import { Bell, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { CalendarioOperacaoResumo } from "@/components/dp/home/CalendarioOperacaoResumo";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { KpiCards } from "@/components/dp/home/KpiCards";
import { MenusPrincipaisCards } from "@/components/dp/home/MenusPrincipaisCards";
import { PontoConformidadeAlerta } from "@/components/dp/PontoConformidadeAlerta";
import { useMenuSwipeVertical } from "@/components/dp/nav/useMenuSwipeVertical";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { VerMenuCompleto } from "@/components/mobile/VerMenuCompleto";
import { ImportarDocumentoAtalho } from "@/components/dp/home/ImportarDocumentoAtalho";
import { AcoesDoDiaCard } from "@/components/dp/home/AcoesDoDiaCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";

export default function DpHome() {
  const isMobile = useIsMobile();
  useMenuSwipeVertical();

  return (
    <DpPage>
      <Helmet><title>Pessoas 360° — Painel Inteligente</title></Helmet>

      <DpPageHeader
        icon={Bell}
        title="Painel Inteligente"
        description="Visão geral e atalhos rápidos."
        className="flex-row items-center justify-between gap-3"
        actionsClassName="w-auto shrink-0 [&>*]:min-h-0"
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

      <AvisosGestorGate />
      <PontoConformidadeAlerta />

      {isMobile && <MenusPrincipaisCards />}

      <KpiCards />

      <div className="grid min-w-0 items-stretch gap-2 lg:grid-cols-2" aria-label="Ações rápidas do gestor">
        <ImportarDocumentoAtalho destaque className="h-full px-4 py-3" />
        <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-1">
          <AcoesDoDiaCard />
          <AniversariantesCard compacto />
        </div>
      </div>

      <CalendarioOperacaoResumo />

      <AtalhosFavoritos />
      <VerMenuCompleto to="/dp/mais" />
    </DpPage>
  );
}
