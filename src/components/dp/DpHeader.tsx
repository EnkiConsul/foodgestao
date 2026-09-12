import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LayoutGrid } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ContextSelector } from "@/components/layout/ContextSelector";
import { DpNotificacoesBell } from "@/components/dp/DpNotificacoesBell";
import { FavoriteToggle } from "@/components/dp/FavoriteToggle";


/** Rotas "raiz" de cada superfície — nelas não faz sentido oferecer "voltar". */
const ROOTS = ["/dp", "/dp/mais", "/dp/meu", "/dp/meu/mais"];

/**
 * No celular, telas internas (2+ níveis) ganham um botão "voltar" à esquerda,
 * já que a barra inferior só alcança o início, os atalhos e o menu "Mais".
 */
function useMobileBack() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const clean = pathname.replace(/\/+$/, "") || "/dp";
  const isRoot = ROOTS.includes(clean);
  const parent = clean.slice(0, clean.lastIndexOf("/")) || "/dp";
  return {
    show: !isRoot,
    goBack: () => navigate(parent),
  };
}

export function DpHeader({ variant = "admin" }: { variant?: "admin" | "portal" }) {
  const { show: showBack, goBack } = useMobileBack();

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur md:px-4">
      {showBack && (
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          aria-label="Voltar"
          className="h-10 w-10 shrink-0 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
      )}
      <SidebarTrigger className={showBack ? "hidden h-9 w-9 shrink-0 md:flex" : "h-10 w-10 shrink-0 md:h-9 md:w-9"} />
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
