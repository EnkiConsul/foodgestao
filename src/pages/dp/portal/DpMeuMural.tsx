import { Helmet } from "react-helmet-async";
import { Megaphone } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { MuralFeed } from "@/components/dp/comunicacao/MuralFeed";

export default function DpMeuMural() {
  return (
    <DpPage>
      <Helmet><title>Mural — Portal do Colaborador</title></Helmet>
      <DpPageHeader
        icon={Megaphone}
        title="Mural"
        description="Avisos da empresa, com confirmação de leitura, reações e comentários."
      />
      <MuralFeed />
    </DpPage>
  );
}
