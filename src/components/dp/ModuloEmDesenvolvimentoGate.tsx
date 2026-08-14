import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { AppModule } from "@/lib/modules";
import { isModuleEmDesenvolvimento, isRotaEmDesenvolvimento } from "@/lib/dp/moduleMap";
import { ModuloEmDesenvolvimentoScreen } from "./ModuloEmDesenvolvimentoScreen";

interface ModuloEmDesenvolvimentoGateProps {
  /** Módulo comercial da tela. Sem módulo, avalia a rota atual. */
  module?: AppModule;
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
 * Para reativar, remova o módulo de MODULOS_EM_DESENVOLVIMENTO
 * (ou a rota de ROTAS_EM_DESENVOLVIMENTO).
 */
export function ModuloEmDesenvolvimentoGate({
  module,
  titulo,
  surface = "admin",
  children,
}: ModuloEmDesenvolvimentoGateProps) {
  const { pathname } = useLocation();
  const pausado = module
    ? isModuleEmDesenvolvimento(module)
    : isRotaEmDesenvolvimento(pathname);

  if (!pausado) return <>{children}</>;

  return (
    <ModuloEmDesenvolvimentoScreen
      titulo={titulo ?? (module ? TITULOS[module] : undefined) ?? "este recurso"}
      voltarPara={surface === "portal" ? "/dp/meu" : "/dp"}
      voltarLabel={surface === "portal" ? "Voltar ao início" : "Voltar ao DP 360°"}
    />
  );
}

export default ModuloEmDesenvolvimentoGate;
