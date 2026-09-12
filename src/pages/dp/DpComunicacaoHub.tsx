import { Helmet } from "react-helmet-async";
import { MessageSquare, Cake } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpGroupCards } from "@/components/dp/DpGroupCards";
import { AniversariantesCard } from "@/components/dp/home/AniversariantesCard";

export default function DpComunicacaoHub() {
  return (
    <DpPage>
      <Helmet><title>Comunicação — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={MessageSquare}
        title="Comunicação"
        description="Gerencie mensagens, modelos, avisos e notificações da equipe."
      />

      <DpGroupCards groupId="comunicacao" />

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cake className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Aniversariantes</h2>
        </div>
        <AniversariantesCard />
      </section>
    </DpPage>
  );
}
