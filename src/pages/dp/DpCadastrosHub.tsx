import { Helmet } from "react-helmet-async";
import { Users2, Scale } from "lucide-react";
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
      <DpGroupCards
        groupId="cadastro"
        extras={[
          {
            label: "Regras de Folgas",
            to: "/dp/folgas?aba=regras",
            icon: Scale,
            description: "DSR, folga dominical, sábados, feriados, menores e férias.",
          },
        ]}
      />
    </DpPage>
  );
}
