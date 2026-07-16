import { Outlet } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DpSidebar } from "./DpSidebar";
import { DpHeader } from "./DpHeader";
import { AvisosPopout } from "./home/AvisosPopout";
import { AtestadosPendentesPopout } from "./home/AtestadosPendentesPopout";

export function DpShell({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  return (
    <SidebarProvider>
      <div className="dp-shell flex min-h-screen w-full bg-[hsl(var(--dp-canvas))]">
        <DpSidebar variant={variant} />
        <div className="flex flex-1 flex-col min-w-0">
          <DpHeader variant={variant} />
          <main className="flex-1 p-4 md:p-8">
            <Outlet />
          </main>
        </div>
        {/* Popouts globais — visíveis em qualquer rota autenticada do DP */}
        <AvisosPopout />
        {variant === "admin" && <AtestadosPendentesPopout />}
      </div>
    </SidebarProvider>
  );
}
