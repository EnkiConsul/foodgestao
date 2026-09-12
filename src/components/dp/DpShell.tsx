import { Outlet, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { permitePullToRefresh } from "@/lib/nav/pullToRefreshRoutes";
import { EdgeGestures } from "@/components/mobile/EdgeGestures";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { SidebarProvider } from "@/components/ui/sidebar";
import { DpSidebar } from "./DpSidebar";
import { DpHeader } from "./DpHeader";
import { AvisosPopout } from "./home/AvisosPopout";
import { AtestadosPendentesPopout } from "./home/AtestadosPendentesPopout";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { HiddenScreenGuard } from "@/components/nav/HiddenScreenGuard";

export function DpShell({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const queryClient = useQueryClient();

  return (
    <SidebarProvider>
      <EdgeGestures />
      <div className="dp-shell flex min-h-screen w-full bg-background">
        <DpSidebar variant={variant} />
        <div className="flex flex-1 flex-col min-w-0">
          <DpHeader variant={variant} />
          <main className="flex-1 p-3 md:p-8 pb-24 md:pb-8">
            <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
              <HiddenScreenGuard surface={variant}>
                <Outlet />
              </HiddenScreenGuard>
            </PullToRefresh>
          </main>
        </div>

        {/* Popouts globais — visíveis em qualquer rota autenticada do DP */}
        <AvisosPopout />
        {variant === "admin" && <AtestadosPendentesPopout />}
      </div>
      <MobileBottomNav />
    </SidebarProvider>
  );
}
