import { useLocation } from "react-router-dom";
import { EdgeGestures } from "@/components/mobile/EdgeGestures";
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

  return (
    <SidebarProvider>
      <EdgeGestures />
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <SubscriptionBanner />
          <AppHeader />
          <main className="flex-1 p-3 md:p-6 pb-24 md:pb-6">
            <Outlet />
          </main>
        </div>
      </div>
      <MobileBottomNav />
      <InstallPrompt />
    </SidebarProvider>
  );
}
