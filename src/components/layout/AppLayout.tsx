import { Profiler, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { BottomNav } from "./BottomNav";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { useBillingRealtime } from "@/hooks/useBillingRealtime";
import { Outlet } from "react-router-dom";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { PerfOverlay } from "@/components/dev/PerfOverlay";


import { markRouteStart, profilerOnRender } from "@/lib/perf";

export function AppLayout() {
  useBillingRealtime();
  const location = useLocation();

  // Marca início de navegação em toda mudança de rota (TTR).
  useEffect(() => {
    markRouteStart(location.pathname);
  }, [location.pathname]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <SubscriptionBanner />
          <AppHeader />
          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <Profiler id={`route:${location.pathname}`} onRender={profilerOnRender}>
              <Outlet />
            </Profiler>
          </main>
        </div>
      </div>
      <BottomNav />
      <InstallPrompt />
      <PerfOverlay />
      
      
      
    </SidebarProvider>
  );
}

