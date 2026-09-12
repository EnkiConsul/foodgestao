import { Helmet } from "react-helmet-async";
import { Bell } from "lucide-react";
import { PendenciasCard } from "@/components/dp/home/PendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { KpiCards } from "@/components/dp/home/KpiCards";
import { MenusPrincipaisCards } from "@/components/dp/home/MenusPrincipaisCards";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { useIsMobile } from "@/hooks/use-mobile";

export default function DpHome() {
  const isMobile = useIsMobile();

  return (
    <DpPage>
      <Helmet><title>Painel Administrativo — Pessoas 360°</title></Helmet>

      <DpPageHeader icon={Bell} title="Painel Administrativo" description="Visão geral e atalhos rápidos." />

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
