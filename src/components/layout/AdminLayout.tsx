import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { Outlet } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { MobileFabProvider } from "@/providers/MobileFabProvider";

export function AdminLayout() {
  return (
    <SidebarProvider>
      <MobileFabProvider>
        <div className="flex min-h-screen w-full">
          <AdminSidebar />
          <div className="flex flex-1 flex-col">
            <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4">
              <SidebarTrigger />
              <Badge variant="secondary" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Backoffice
              </Badge>
              <div className="flex-1" />
            </header>
            <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">
              <Outlet />
            </main>
          </div>
        </div>
        <MobileBottomNav />
      </MobileFabProvider>
    </SidebarProvider>
  );
}
