import { Helmet } from "react-helmet-async";
import DpOperacaoPanorama from "./DpOperacaoPanorama";

/** Rotina: abre direto no calendário; o título alterna entre as telas do módulo. */
export default function DpRotinaHub() {
  return (
    <>
      <Helmet><title>Rotina — Pessoas 360°</title></Helmet>
      <DpOperacaoPanorama modo="calendario" />
    </>
  );
}
