import { Helmet } from "react-helmet-async";
import { Bell } from "lucide-react";
import { PendenciasCard } from "@/components/dp/home/PendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { AtestadosPendentesPopout } from "@/components/dp/home/AtestadosPendentesPopout";

export default function DpHome() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Helmet><title>Painel Administrativo — DP 360°</title></Helmet>


      <header>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-8">Visão geral e atalhos rápidos.</p>
      </header>

      <AtestadosPendentesPopout />

      <div className="grid gap-5 lg:grid-cols-2">
        <PendenciasCard />
        <AniversariantesCard />
      </div>

      <AtalhosFavoritos />
    </div>
  );
}

