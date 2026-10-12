import { Helmet } from "react-helmet-async";
import { DpGroupCards } from "@/components/dp/DpGroupCards";
import DpOperacaoPanorama from "./DpOperacaoPanorama";

/**
 * Rotina: central com os cards de cada tela do módulo no topo
 * (Calendário, Folgas, Férias, Ocorrências, Convocações, Atestados)
 * e o calendário da operação logo abaixo.
 */
export default function DpRotinaHub() {
  return (
    <>
      <Helmet><title>Rotina — Pessoas 360°</title></Helmet>
      <DpOperacaoPanorama modo="calendario" topo={<DpGroupCards groupId="rotina" />} />
    </>
  );
}
