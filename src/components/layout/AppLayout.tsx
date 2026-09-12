import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EdgeGestures } from "@/components/mobile/EdgeGestures";
import { PullToRefresh } from "@/components/mobile/PullToRefresh";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";

import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { useBillingRealtime } from "@/hooks/useBillingRealtime";
import { Outlet } from "react-router-dom";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export function AppLayout() {
  useBillingRealtime();
  useLocation();
  const queryClient = useQueryClient();

  return (
    <SidebarProvider>
      <EdgeGestures />
      <div className="flex min-h-[var(--vvh,100svh)] w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <SubscriptionBanner />
          <AppHeader />
          <main className="flex-1 p-3 md:p-6 pb-22 md:pb-6">
            <PullToRefresh onRefresh={() => queryClient.invalidateQueries()}>
              <Outlet />
            </PullToRefresh>
          </main>
        </div>
      </div>
      <MobileBottomNav />
      <InstallPrompt />
    </SidebarProvider>
  );
}
