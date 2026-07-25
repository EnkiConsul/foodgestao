import { Eye, EyeOff, LayoutGrid } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { usePrivacy } from "@/hooks/usePrivacy";
import { useActiveModule } from "@/hooks/useActiveModule";

export function AppHeader() {
  const { privacyMode, togglePrivacy } = usePrivacy();
  const activeModule = useActiveModule();
  const location = useLocation();
  const showHubShortcut =
    activeModule !== "hub" &&
    activeModule !== "portal_colaborador" &&
    activeModule !== "admin" &&
    location.pathname !== "/hub";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card px-3 md:px-4">
      <SidebarTrigger className="h-10 w-10 md:h-9 md:w-9" />

      {showHubShortcut && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-10 gap-1.5 px-2 md:h-9 md:px-3"
          aria-label="Voltar ao Hub de Módulos"
        >
          <Link to="/hub">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
        </Button>
      )}

      <ContextSelector />

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-10 w-10 text-muted-foreground md:h-9 md:w-9"
        onClick={togglePrivacy}
        title={privacyMode ? "Mostrar valores" : "Ocultar valores"}
        aria-label={privacyMode ? "Mostrar valores" : "Ocultar valores"}
      >
        {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>

      <NotificationsBell />
    </header>
  );
}
