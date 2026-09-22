import { Helmet } from "react-helmet-async";
import { Users2 } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpGroupCards } from "@/components/dp/DpGroupCards";

export default function DpCadastrosHub() {
  return (
    <DpPage>
      <Helmet><title>Cadastro — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={Users2}
        title="Cadastro"
        description="Gerencie colaboradores, unidades, cargos e salários, benefícios e pendências."
      />
      <DpGroupCards groupId="cadastro" />
    </DpPage>
  );
}
