import { Helmet } from "react-helmet-async";
import { Bell } from "lucide-react";
import { PendenciasCard } from "@/components/dp/home/PendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { AtestadosPendentesPopout } from "@/components/dp/home/AtestadosPendentesPopout";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";

export default function DpHome() {
  return (
    <DpPage>
      <Helmet><title>Painel Administrativo — DP 360°</title></Helmet>

      <DpPageHeader icon={Bell} title="Painel Administrativo" description="Visão geral e atalhos rápidos." />

      <AtestadosPendentesPopout />

      <div className="grid gap-5 lg:grid-cols-2">
        <PendenciasCard />
        <AniversariantesCard />
      </div>

      <AtalhosFavoritos />
    </DpPage>
  );
}

