import type { ReactNode } from "react";
import type { AppModule } from "@/lib/modules";
import { isModuleEmDesenvolvimento } from "@/lib/dp/moduleMap";
import { ModuloEmDesenvolvimentoScreen } from "./ModuloEmDesenvolvimentoScreen";

interface ModuloEmDesenvolvimentoGateProps {
  module: AppModule;
  /** Nome exibido na máscara (default: rótulo do módulo). */
  titulo?: string;
  /** Superfície de origem: define o destino do botão voltar. */
  surface?: "admin" | "portal";
  children: ReactNode;
}

const TITULOS: Partial<Record<AppModule, string>> = {
  ponto: "Ponto",
  folha: "Folha de Pagamento",
  escala: "Escala",
};

/**
 * Máscara temporária: telas de módulos pausados continuam roteadas e no código,
 * mas exibem o aviso de desenvolvimento em vez do conteúdo real.
 * Para reativar, remova o módulo de MODULOS_EM_DESENVOLVIMENTO.
 */
export function ModuloEmDesenvolvimentoGate({
  module,
  titulo,
  surface = "admin",
  children,
}: ModuloEmDesenvolvimentoGateProps) {
  if (!isModuleEmDesenvolvimento(module)) return <>{children}</>;

  return (
    <ModuloEmDesenvolvimentoScreen
      titulo={titulo ?? TITULOS[module] ?? "este recurso"}
      voltarPara={surface === "portal" ? "/dp/meu" : "/dp"}
      voltarLabel={surface === "portal" ? "Voltar ao início" : "Voltar ao DP 360°"}
    />
  );
}

export default ModuloEmDesenvolvimentoGate;
