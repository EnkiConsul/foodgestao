import type { ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import DpOperacaoPanorama from "./DpOperacaoPanorama";

/**
 * Rotina: central com os cards de cada tela do módulo no topo
 * (Calendário, Folgas, Férias, Ocorrências, Convocações, Atestados)
 * e o calendário da operação logo abaixo.
 */
export default function DpRotinaHub({ topo }: { topo?: ReactNode } = {}) {
  return (
    <DpOperacaoPanorama modo="calendario" topo={topo} />
  );
}
