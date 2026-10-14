import { Link } from "react-router-dom";
import { ChevronRight, Menu } from "lucide-react";

/** Atalho visível no celular que leva ao menu completo do módulo. */
export function VerMenuCompleto({ to }: { to: string }) {
  return (
    <Link
      to={to}
      className="md:hidden flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium shadow-sm active:bg-muted"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Menu className="h-5 w-5" />
      </span>
      <span className="flex-1">
        Ver menu completo
        <span className="block text-xs font-normal text-muted-foreground">Todas as telas, além dos atalhos</span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
