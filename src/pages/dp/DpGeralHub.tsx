import { Helmet } from "react-helmet-async";
import { Settings } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpGroupCards } from "@/components/dp/DpGroupCards";

export default function DpGeralHub() {
  return (
    <DpPage>
      <Helmet><title>Geral — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Settings}
        title="Geral"
        description="Indicadores, configurações do módulo e auditoria de erros."
      />
      <DpGroupCards groupId="geral" />
    </DpPage>
  );
}
