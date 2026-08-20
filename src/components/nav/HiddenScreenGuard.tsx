import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useHiddenScreens } from "@/hooks/useHiddenScreens";
import { ModuloEmDesenvolvimentoScreen } from "@/components/dp/ModuloEmDesenvolvimentoScreen";

/**
 * Telas marcadas como "em desenvolvimento" pelo super admin exibem o aviso
 * em vez do conteúdo — mesmo quando a URL é acessada direto.
 */
export function HiddenScreenGuard({
  surface = "admin",
  children,
}: {
  surface?: "admin" | "portal";
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { isPathHidden, loading } = useHiddenScreens();

  if (loading || !isPathHidden(pathname)) return <>{children}</>;

  return (
    <ModuloEmDesenvolvimentoScreen
      titulo="esta tela"
      descricao="Esta tela está em desenvolvimento e será liberada em breve. As informações já registradas permanecem salvas com segurança."
      voltarPara={surface === "portal" ? "/dp/meu" : "/dp"}
      voltarLabel={surface === "portal" ? "Voltar ao início" : "Voltar ao Pessoas 360°"}
    />
  );
}

export default HiddenScreenGuard;
