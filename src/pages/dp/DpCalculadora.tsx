import { Calculator } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { DpPage, DpPageHeader } from "@/components/dp/DpPage";
import { CalculadoraCompensacao, type PerfilCalculadora } from "@/components/dp/calculadora/CalculadoraCompensacao";

/** Calculadora de simulação (sem gravar nada). Gestor e colaborador usam a mesma tela. */
export default function DpCalculadora({ perfil = "gestor" }: { perfil?: PerfilCalculadora }) {
  return (
    <>
      <Helmet><title>Calculadora — Pessoas 360°</title></Helmet>
      <DpPage narrow>
        <DpPageHeader title="Calculadora" icon={Calculator} help={null} />
        <CalculadoraCompensacao perfil={perfil} />
      </DpPage>
    </>
  );
}

export function DpMeuCalculadora() {
  return <DpCalculadora perfil="colaborador" />;
}
