import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { NotificationsBell } from "@/components/layout/NotificationsBell";
import { usePrivacy } from "@/hooks/usePrivacy";

export function AppHeader() {
  const { privacyMode, togglePrivacy } = usePrivacy();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4">
      <SidebarTrigger aria-label="Alternar menu lateral" />

      <ContextSelector />

      <div className="flex-1" />

      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 text-muted-foreground"
        onClick={togglePrivacy}
        title={privacyMode ? "Mostrar valores" : "Ocultar valores"}
        aria-label={privacyMode ? "Mostrar valores" : "Ocultar valores"}
        aria-pressed={privacyMode}
      >
        {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>

      <NotificationsBell />
    </header>
  );
}
