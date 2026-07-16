import { Helmet } from "react-helmet-async";
import { Bell, Users, Wallet, ClipboardList, FileText, Megaphone, MessageSquare, ShieldAlert } from "lucide-react";
import { PendenciasCard } from "@/components/dp/home/PendenciasCard";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";
import { AtalhosFavoritos } from "@/components/dp/home/AtalhosFavoritos";
import { AvisosPopout } from "@/components/dp/home/AvisosPopout";
import { AtestadosPendentesPopout } from "@/components/dp/home/AtestadosPendentesPopout";

export default function DpHome() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Helmet><title>Painel Administrativo — DP 360°</title></Helmet>

      <AvisosPopout />

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

      <AtalhosFavoritos
        items={[
          { icon: Users, label: "Colaboradores", to: "/dp/colaboradores" },
          { icon: Wallet, label: "Folha", to: "/dp/folha" },
          { icon: ClipboardList, label: "Solicitações", to: "/dp/solicitacoes" },
          { icon: FileText, label: "Documentos", to: "/dp/documentos" },
          { icon: Megaphone, label: "Avisos", to: "/dp/avisos" },
          { icon: MessageSquare, label: "Comunicação", to: "/dp/comunicacao" },
          { icon: ShieldAlert, label: "Disciplinar", to: "/dp/disciplinar" },
        ]}
      />
    </div>
  );
}
