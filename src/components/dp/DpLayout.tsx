import { Outlet } from "react-router-dom";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpShell } from "@/components/dp/DpShell";

/**
 * DpLayout: guard de contexto PJ + DpShell (sidebar/header próprios do módulo).
 */
export function DpLayout() {
  const { contextType } = useCompanyContext();

  if (contextType !== "pj") {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-muted-foreground">
        Pessoas 360° está disponível apenas em contexto Empresa (PJ).
      </div>
    );
  }

  return <DpShell variant="admin" />;
}

// Wrapper interno usado pelo DpShell — Outlet
export function DpLayoutOutlet() {
  return <Outlet />;
}
