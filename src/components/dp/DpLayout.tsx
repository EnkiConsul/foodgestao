import { Outlet } from "react-router-dom";
import { useCompanyContext } from "@/hooks/useCompanyContext";
import { DpNotificacoesBell } from "@/components/dp/DpNotificacoesBell";

export function DpLayout() {
  const { contextType } = useCompanyContext();

  if (contextType !== "pj") {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-muted-foreground">
        DP 360° está disponível apenas em contexto Empresa (PJ).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <DpNotificacoesBell />
      </div>
      <Outlet />
    </div>
  );
}
