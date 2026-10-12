import { Helmet } from "react-helmet-async";
import { DpGroupCards } from "@/components/dp/DpGroupCards";
import { DpPage } from "@/components/dp/DpPage";

/** Rotina: menu com os cards de cada tela do módulo (sem o calendário). */
export default function DpRotinaHub() {
  return (
    <>
      <Helmet><title>Rotina — Pessoas 360°</title></Helmet>
      <DpPage title="Rotina">
        <DpGroupCards groupId="rotina" />
      </DpPage>
    </>
  );
}
