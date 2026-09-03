import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { ModuleSwitcherChip } from "@/components/mobile/ModuleSwitcherChip";
import { DpNotificacoesBell } from "@/components/dp/DpNotificacoesBell";
import { FavoriteToggle } from "@/components/dp/FavoriteToggle";

export function DpHeader({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 backdrop-blur px-3 md:px-4">
      <SidebarTrigger className="h-10 w-10 shrink-0 md:h-9 md:w-9" />
      <div className="min-w-0 shrink md:hidden">
        <ModuleSwitcherChip />
      </div>
      {variant === "admin" && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="hidden h-9 gap-1.5 px-3 md:inline-flex"
          aria-label="Voltar ao Hub de Módulos"
        >
          <Link to="/hub">
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline">Hub</span>
          </Link>
        </Button>
      )}
      {variant === "admin" && <ContextSelector />}
      <div className="flex-1" />
      <FavoriteToggle />
      <DpNotificacoesBell />
    </header>
  );
}


