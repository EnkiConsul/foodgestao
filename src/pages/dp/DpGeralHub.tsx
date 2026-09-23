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
        description="Indicadores e configurações do módulo."
      />
      <DpGroupCards groupId="geral" />
    </DpPage>
  );
}
