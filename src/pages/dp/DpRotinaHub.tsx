import { Helmet } from "react-helmet-async";
import { RotinaCards } from "@/components/dp/rotina/RotinaNav";
import DpOperacaoPanorama from "./DpOperacaoPanorama";

/** Rotina: atalhos das telas no topo + calendário oficial do gestor. */
export default function DpRotinaHub() {
  return (
    <>
      <Helmet><title>Rotina — Pessoas 360°</title></Helmet>
      <div className="px-3 pt-3 sm:px-6 sm:pt-6">
        <RotinaCards />
      </div>
      <DpOperacaoPanorama modo="calendario" />
    </>
  );
}
