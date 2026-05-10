import { Bell, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";


export function AppHeader() {
  const [privacyMode, setPrivacyMode] = useState(false);
  const { isSuperAdmin } = useSuperAdmin();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger className="hidden md:flex" />
      <div className="md:hidden">
        <SidebarTrigger />
      </div>


      <ContextSelector />

      <div className="flex-1" />

      {isSuperAdmin && (
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/admin">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Backoffice</span>
          </Link>
        </Button>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground"
        onClick={() => setPrivacyMode(!privacyMode)}
        title={privacyMode ? "Mostrar valores" : "Ocultar valores"}
      >
        {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>

      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
      </Button>
    </header>
  );
}
