import { Helmet } from "react-helmet-async";
import { CalendarClock } from "lucide-react";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { DpGroupCards } from "@/components/dp/DpGroupCards";

export default function DpRotinaHub() {
  return (
    <DpPage>
      <Helmet><title>Rotina — Pessoas 360°</title></Helmet>
      <DpPageHeader
        icon={CalendarClock}
        title="Rotina"
        description="Operação do mês, ocorrências, convocações, folgas, férias e atestados."
      />
      <DpGroupCards groupId="rotina" />
    </DpPage>
  );
}
